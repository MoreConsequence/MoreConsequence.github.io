// 每事件开销与吞吐对照：同一台机器上，分别起 SSE 与 WS 服务端（尽速模式），
// 客户端测：到达首事件耗时、总耗时、事件/秒、每事件线上字节数。
// 一次命令跑完，服务端由本脚本拉起并回收。
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { consumeFrame } from "./ws-frame.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVENTS = 100000;
const DATA_BYTES = 32;
const SSE_PORT = 8081;
const WS_PORT = 8082;

function spawnServer(file, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [file, `--port=${port}`, `--events=${EVENTS}`, `--data-bytes=${DATA_BYTES}`],
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

function measureSSE(port) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      let buf = "";
      let received = 0;
      let bytes = 0;
      let firstAt = null;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        bytes += Buffer.byteLength(chunk);
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          // 首块是 `: connected\nretry: 100`（注释 + retry 行），没有 data 行，不计
          if (block.includes("\ndata:") || block.startsWith("data:")) {
            if (firstAt === null) firstAt = performance.now();
            received += 1;
          }
        }
      });
      res.on("end", () => {
        const totalMs = performance.now() - t0;
        resolve({
          received,
          setupMs: firstAt === null ? NaN : firstAt - t0,
          totalMs,
          bytes,
          eventsPerSec: Math.round(received / (totalMs / 1000)),
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

function measureWS(port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, "127.0.0.1");
    const key = crypto.randomBytes(16).toString("base64");
    let buf = Buffer.alloc(0);
    let received = 0;
    let firstAt = null;
    let bytes = 0;
    let handshaken = false;
    let handshakeLen = 0;
    const t0 = performance.now();
    let settled = false;

    const finish = (timeout) => {
      if (settled) return;
      settled = true;
      const totalMs = performance.now() - t0;
      const bodyBytes = bytes - handshakeLen;
      resolve({
        received,
        setupMs: firstAt === null ? NaN : firstAt - t0,
        totalMs,
        bytes: Math.max(0, bodyBytes),
        eventsPerSec: Math.round(received / (totalMs / 1000)),
        timeout,
      });
    };

    sock.on("connect", () => {
      sock.write(
        "GET / HTTP/1.1\r\n" +
          `Host: 127.0.0.1:${port}\r\n` +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Key: ${key}\r\n` +
          "Sec-WebSocket-Version: 13\r\n" +
          "\r\n"
      );
    });
    sock.on("data", (chunk) => {
      bytes += chunk.length;
      buf = Buffer.concat([buf, chunk]);
      if (!handshaken) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = buf.subarray(0, end).toString();
        handshaken = true;
        handshakeLen = end + 4;
        if (!head.startsWith("HTTP/1.1 101")) {
          finish(true);
          sock.destroy();
          return;
        }
        buf = buf.subarray(handshakeLen);
      }
      for (;;) {
        const frame = consumeFrame(buf);
        if (!frame) break;
        buf = buf.subarray(frame.consumed);
        if (frame.opcode === 0x1) {
          if (firstAt === null) firstAt = performance.now();
          received += 1;
        } else if (frame.opcode === 0x8) {
          finish(false);
          sock.destroy();
          return;
        }
      }
    });
    sock.on("close", () => finish(false));
    sock.on("error", (e) => {
      if (!settled) reject(e);
    });
    setTimeout(() => finish(true), 15000);
  });
}

const row = (k, a, b) => `${k.padEnd(14)}${String(a).padEnd(18)}${String(b)}`;

const sseSrv = await spawnServer(path.join(HERE, "sse-server.mjs"), SSE_PORT);
const sse = await measureSSE(SSE_PORT);
sseSrv.kill();

const wsSrv = await spawnServer(path.join(HERE, "ws-server.mjs"), WS_PORT);
const ws = await measureWS(WS_PORT);
wsSrv.kill();

console.log(`\n=== 每事件开销与吞吐（events=${EVENTS}, data=${DATA_BYTES}B, 本机一轮）===\n`);
console.log(row("", "SSE", "WebSocket"));
console.log(row("收到事件数", sse.received, ws.received));
console.log(row("到达首事件", `${sse.setupMs.toFixed(2)} ms`, `${ws.setupMs.toFixed(2)} ms`));
console.log(row("总耗时", `${sse.totalMs.toFixed(1)} ms`, `${ws.totalMs.toFixed(1)} ms`));
console.log(row("事件/秒", sse.eventsPerSec, ws.eventsPerSec));
console.log(row("线上字节(含帧头)", sse.bytes, ws.bytes));
console.log(row("每事件字节", `${(sse.bytes / sse.received).toFixed(1)} B`, `${(ws.bytes / ws.received).toFixed(1)} B`));
console.log("\n说明：SSE 每事件是 `id:N` + `data:` + 空行 的文本块；WS 每事件是 `id:N|payload` 文本帧 + 2B 帧头。");
