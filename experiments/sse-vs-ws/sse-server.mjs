// SSE 服务端：纯 HTTP，Content-Type: text/event-stream。
// 断线重连语义由协议自带：客户端带 Last-Event-ID 重连时，从该 id 的下一号续发。
//
// 参数：
//   --port=P          监听端口（默认 8081）
//   --events=N        每条连接发送的事件总数（默认 100000）
//   --interval-ms=M   >0 用定时器逐条发；=0 尽速推送并尊重 socket 背压
//   --data-bytes=B    data 行 payload 字节数（默认 32）
//   --drop-at=K       发到第 K 条后主动销毁连接，模拟服务端中途断连（0 表示不断）
import http from "node:http";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
function opt(name, dflt) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(`--${name}=`.length);
}
const port = Number(opt("port", 8081));
const events = Number(opt("events", 100000));
const intervalMs = Number(opt("interval-ms", 0));
const dataBytes = Number(opt("data-bytes", 32));
const dropAt = Number(opt("drop-at", 0));

const payload = "x".repeat(dataBytes);
let droppedOnce = false; // 整个服务端只“崩”一次：模拟进程故障一次，恢复后保持健康

http
  .createServer((req, res) => {
    const lastEventId = Number(req.headers["last-event-id"]) || 0;
    const start = lastEventId + 1;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.flushHeaders(); // 立刻把响应头刷给客户端，否则整条流被 Node 缓冲
    // `:` 开头是注释行：SSE 规范规定客户端忽略，用作 keep-alive 防代理断空闲连接
    res.write(": connected\nretry: 100\n");

    const startedAt = performance.now();
    let sent = 0;

    const done = () => {
      const secs = (performance.now() - startedAt) / 1000;
      console.log(`[sse] last-event-id=${lastEventId} sent=${sent} ${secs.toFixed(3)}s ${Math.round(sent / secs)} ev/s`);
      res.end();
    };
    // 整个进程只掐断一次；重连连接正常发完，避免续传时又撞上断点
    const maybeDrop = (n) => {
      if (dropAt > 0 && !droppedOnce && n === dropAt) {
        droppedOnce = true;
        res.destroy(); // 服务端主动断开：客户端应自动带 Last-Event-ID 重连
        return true;
      }
      return false;
    };

    // 停止条件是 id 到达 events（而非“发送了 events 条”），保证续传连接不会多推
    if (intervalMs > 0) {
      const timer = setInterval(() => {
        const n = start + sent;
        if (maybeDrop(n)) return clearInterval(timer);
        res.write(`id: ${n}\ndata: ${payload}\n\n`);
        sent += 1;
        if (n >= events) {
          clearInterval(timer);
          done();
        }
      }, intervalMs);
      res.on("close", () => clearInterval(timer));
    } else {
      // 尽速模式：res.write 返回 false 表示 socket 写缓冲已满（背压），等 drain 再续
      function pump() {
        if (res.destroyed) return;
        while (start + sent <= events) {
          const n = start + sent;
          if (maybeDrop(n)) return;
          const ok = res.write(`id: ${n}\ndata: ${payload}\n\n`);
          sent += 1;
          if (!ok) return res.once("drain", pump);
        }
        done();
      }
      pump();
    }
    res.on("error", () => {});
  })
  .listen(port, () => console.log(`[sse] listening on http://127.0.0.1:${port} events=${events} interval=${intervalMs}ms data=${dataBytes}B drop-at=${dropAt}`));
