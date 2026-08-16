// 断线重连语义对照：服务端在事件 20 处掐断连接（--drop-at=20），看两种协议怎么恢复。
//  - SSE：客户端自动带 Last-Event-ID 重连，服务端从下一号续发 → 无缺口。
//  - WebSocket：客户端自己重连；把续传游标放进重连请求的 query（应用层约定）→ 无缺口，但两端都要你写。
//  - WebSocket 只重连不续传：服务端从头重推 → 前段事件重复。
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { consumeFrame } from "./ws-frame.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVENTS = 50;
const DROP_AT = 20;
const INTERVAL_MS = 2;
const SSE_PORT = 8081;
const WS_PORT = 8082;
const GIVE_UP_MS = 8000;

function spawnServer(file, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        file,
        `--port=${port}`,
        `--events=${EVENTS}`,
        `--drop-at=${DROP_AT}`,
        `--interval-ms=${INTERVAL_MS}`,
        `--data-bytes=16`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("server start timeout"));
    }, 5000);
    child.stdout.on("data", (d) => {
      if (d.toString().includes("listening")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on("exit", () => {
      clearTimeout(timer);
      reject(new Error("server exited early"));
    });
  });
}

// 极简 EventSource：只实现本实验需要的重连 + Last-Event-ID 语义。
// 在“正常收尾（服务端 res.end）”时结算，保证 got 是完整快照。
function sseCollect(port, expected) {
  return new Promise((resolve) => {
    const got = [];
    let lastEventId = 0;
    let connects = 0;
    let done = false;
    let inFlight = false;
    let scheduled = false;
    let retry = 100;
    let timer = null;

    const settle = () => {
      clearTimeout(timer);
      resolve({ got, connects, timeout: false });
    };

    function connect() {
      if (inFlight) return;
      inFlight = true;
      connects += 1;
      const headers = { Accept: "text/event-stream" };
      if (lastEventId > 0) headers["Last-Event-ID"] = String(lastEventId);
      const req = http.get({ host: "127.0.0.1", port, path: "/", headers }, (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          buf += chunk;
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const retryM = /retry:\s*(\d+)/.exec(block);
            if (retryM) retry = Number(retryM[1]);
            const idM = /id:\s*(\d+)/.exec(block);
            if (idM && block.includes("data:")) {
              const id = Number(idM[1]);
              lastEventId = Math.max(lastEventId, id);
              got.push(id);
            }
          }
        });
        res.on("end", () => {
          // 只有正常收尾才有 end；被掐断的流（drop）只有 close，会走重连
          if (!done && got.length >= expected) {
            done = true;
            settle();
          }
        });
      });
      const onClosed = () => {
        inFlight = false;
        if (done || scheduled) return;
        scheduled = true;
        setTimeout(() => {
          scheduled = false;
          connect();
        }, retry);
      };
      req.on("error", onClosed);
      req.on("close", onClosed);
    }
    connect();

    timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ got, connects, timeout: true });
      }
    }, GIVE_UP_MS);
  });
}

// 极简 WebSocket 客户端：重连与续传都要自己写。
// 在收到 close 帧时结算（服务端正常收尾的标志；硬断时没有 close 帧，会走重连）。
function wsCollect(port, expected, { resume }) {
  return new Promise((resolve) => {
    const got = [];
    let lastId = 0;
    let connects = 0;
    let done = false;
    let timer = null;
    const RETRY_MS = 100;

    const settle = () => {
      clearTimeout(timer);
      resolve({ got, connects, timeout: false });
    };

    function connect() {
      connects += 1;
      const sock = net.connect(port, "127.0.0.1");
      let buf = Buffer.alloc(0);
      let handshaken = false;
      sock.on("connect", () => {
        const key = crypto.randomBytes(16).toString("base64");
        // 续传游标放进重连请求的 query——这是应用层约定，协议本身没有 resume 概念
        const path = resume && lastId > 0 ? `/?resume=${lastId}` : "/";
        sock.write(
          `GET ${path} HTTP/1.1\r\n` +
            `Host: 127.0.0.1:${port}\r\n` +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            `Sec-WebSocket-Key: ${key}\r\n` +
            "Sec-WebSocket-Version: 13\r\n" +
            "\r\n"
        );
      });
      sock.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (!handshaken) {
          const end = buf.indexOf("\r\n\r\n");
          if (end < 0) return;
          if (!buf.subarray(0, end).toString().startsWith("HTTP/1.1 101")) {
            sock.destroy();
            return;
          }
          buf = buf.subarray(end + 4);
          handshaken = true;
        }
        for (;;) {
          const frame = consumeFrame(buf);
          if (!frame) break;
          buf = buf.subarray(frame.consumed);
          if (frame.opcode === 0x1) {
            const m = /^id:(\d+)/.exec(frame.payload);
            if (m) {
              const id = Number(m[1]);
              lastId = Math.max(lastId, id);
              got.push(id);
            }
          } else if (frame.opcode === 0x8) {
            // 服务端正常收尾的 close 帧：只有它表示流已完整（硬断时没有 close 帧）
            sock.destroy();
            if (!done && got.length >= expected) {
              done = true;
              settle();
            }
          }
        }
      });
      sock.on("close", () => {
        if (!done) setTimeout(connect, RETRY_MS);
      });
      sock.on("error", () => {});
    }
    connect();

    timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ got, connects, timeout: true });
      }
    }, GIVE_UP_MS);
  });
}

const gapReport = (got, expected) => {
  const missing = [];
  for (let id = 1; id <= expected; id++) if (!got.includes(id)) missing.push(id);
  const dups = got.length - new Set(got).size;
  return { received: got.length, missing, dups };
};

const sseSrv = await spawnServer(path.join(HERE, "sse-server.mjs"), SSE_PORT);
const sse = await sseCollect(SSE_PORT, EVENTS);
sseSrv.kill();

// 每个 WS 阶段都起一个全新服务端，保证断点（droppedOnce）各自重新武装
const wsSrv = await spawnServer(path.join(HERE, "ws-server.mjs"), WS_PORT);
const wsResume = await wsCollect(WS_PORT, EVENTS, { resume: true });
wsSrv.kill();

const wsSrv2 = await spawnServer(path.join(HERE, "ws-server.mjs"), WS_PORT);
const wsNoResume = await wsCollect(WS_PORT, EVENTS, { resume: false });
wsSrv2.kill();

const r1 = gapReport(sse.got, EVENTS);
const r2 = gapReport(wsResume.got, EVENTS);
const r3 = gapReport(wsNoResume.got, EVENTS);

console.log("\n=== 断线重连：服务端在第 20 条后掐断连接（expected=50）===\n");
console.log(`SSE               重连次数=${sse.connects - 1}  收到=${r1.received}/50  缺口=[${r1.missing.join(",") || "无"}]  (Last-Event-ID 自动续传)`);
console.log(`WebSocket(续传)   重连次数=${wsResume.connects - 1}  收到=${r2.received}/50  缺口=[${r2.missing.join(",") || "无"}]  (query 里带 resume 游标)`);
console.log(`WebSocket(仅重连) 重连次数=${wsNoResume.connects - 1}  收到=${r3.received}/50  重复=${r3.dups}  (服务端从头重推)`);
console.log("\n要点：SSE 的重连语义是协议内置的（Last-Event-ID + retry）；WS 必须自己实现重连，续传游标也要靠应用层约定。");

// 收尾：清掉残留的客户端 socket/定时器，避免进程挂住
process.exit(0);
