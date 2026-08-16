// WebSocket 服务端：最小 RFC 6455 实现（教学原型，仅覆盖本实验所需）。
// 重连没有协议级支持：客户端必须自己重连，并用应用层消息 `resume:N` 告诉服务端续传游标。
//
// 参数同 sse-server.mjs，另加：
//   --ping-ms=P  >0 时服务端周期发 ping 帧做心跳（默认 0，不发）
import http from "node:http";
import { performance } from "node:perf_hooks";
import { encodeTextFrame, encodeControlFrame, consumeFrame, handshakeAccept } from "./ws-frame.mjs";

const args = process.argv.slice(2);
function opt(name, dflt) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(`--${name}=`.length);
}
const port = Number(opt("port", 8082));
const events = Number(opt("events", 100000));
const intervalMs = Number(opt("interval-ms", 0));
const dataBytes = Number(opt("data-bytes", 32));
const dropAt = Number(opt("drop-at", 0));
const pingMs = Number(opt("ping-ms", 0));

const payload = "x".repeat(dataBytes);
let droppedOnce = false; // 整个进程只“崩”一次

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" }).end("this is a websocket endpoint, use upgrade");
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || (req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  // 重连续传游标是应用层约定：客户端把它放在握手请求的 query 里（协议本身没有这个概念）
  const resumeM = /\bresume=(\d+)/.exec(req.url || "");
  const startId = resumeM ? Number(resumeM[1]) + 1 : 1;
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${handshakeAccept(key)}\r\n\r\n`
  );
  handleSocket(socket, startId);
});

function handleSocket(socket, initialStartId = 1) {
  let buffer = Buffer.alloc(0);
  let timer = null;
  const stopStreaming = () => {
    if (timer) clearInterval(timer);
  };

  function startStreaming(startId) {
    let nextId = startId;
    let sent = 0;
    const startedAt = performance.now();

    // 整个进程只掐断一次；后续重连流正常发完，避免续传时又撞上断点
    const maybeDrop = (n) => {
      if (dropAt > 0 && !droppedOnce && n === dropAt) {
        droppedOnce = true;
        stopStreaming();
        socket.destroy(); // 硬断：不发 close 帧，客户端只能感知连接被掐断
        return true;
      }
      return false;
    };
    const done = () => {
      const secs = (performance.now() - startedAt) / 1000;
      console.log(`[ws] stream startId=${startId} sent=${sent} ${secs.toFixed(3)}s ${Math.round(sent / secs)} ev/s`);
      if (!socket.destroyed) socket.end(encodeControlFrame(8)); // 正常收尾：发 close 帧
    };

    // 停止条件是 id 到达 events（而非“发送了 events 条”），保证续传流不会多推
    if (intervalMs > 0) {
      timer = setInterval(() => {
        const n = nextId;
        if (maybeDrop(n)) return stopStreaming();
        socket.write(encodeTextFrame(`id:${n}|${payload}`));
        nextId += 1;
        sent += 1;
        if (n >= events) {
          clearInterval(timer);
          done();
        }
      }, intervalMs);
    } else {
      // 尽速模式：socket.write 返回 false 表示写缓冲满（背压），等 drain 再续
      function pump() {
        if (socket.destroyed) return;
        while (nextId <= events) {
          const n = nextId;
          if (maybeDrop(n)) return;
          const ok = socket.write(encodeTextFrame(`id:${n}|${payload}`));
          nextId += 1;
          sent += 1;
          if (!ok) return socket.once("drain", pump);
        }
        done();
      }
      pump();
    }
  }

  startStreaming(initialStartId);

  // 读客户端帧：处理 ping / close / 应用层续传消息
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const frame = consumeFrame(buffer);
      if (!frame) break;
      buffer = buffer.subarray(frame.consumed);
      if (frame.opcode === 0x9) {
        // ping → 回 pong（心跳的另一半，客户端不必自己实现）
        socket.write(encodeControlFrame(0xa, Buffer.from(frame.payload, "utf8")));
      } else if (frame.opcode === 0x8) {
        socket.end(encodeControlFrame(8));
      } else if (frame.opcode === 0x1) {
        // 应用层消息 `resume:N`：客户端断线重连后，服务端从 N+1 续发
        const m = /^resume:(\d+)$/.exec(frame.payload.trim());
        if (m) {
          stopStreaming();
          startStreaming(Number(m[1]) + 1);
        }
      }
    }
  });

  // 心跳：协议只定义了 ping/pong 帧，发不发、多久发一次、多久算死都要自己定
  if (pingMs > 0) {
    const hb = setInterval(() => {
      if (!socket.destroyed) socket.write(encodeControlFrame(0x9, Buffer.from("hb", "utf8")));
    }, pingMs);
    socket.on("close", () => clearInterval(hb));
  }
}

server.listen(port, () => console.log(`[ws] listening on 127.0.0.1:${port} events=${events} interval=${intervalMs}ms data=${dataBytes}B drop-at=${dropAt} ping-ms=${pingMs}`));
