// 长任务推送 vs 轮询：SSE 断线带 Last-Event-ID 重连续传，不丢不重。
// 只用内置 http。运行：node sse.mjs
import http from "node:http";

const EVENTS = [
  { id: 1, data: "started" },
  { id: 2, data: "progress:50" },
  { id: 3, data: "progress:100" },
  { id: 4, data: "done" },
];

const srv = http.createServer((req, res) => {
  if (req.url !== "/tasks/1/stream") {
    res.writeHead(404);
    res.end();
    return;
  }
  const since = Number(req.headers["last-event-id"] || 0);
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  // 慢放：每 20ms 一个事件，客户端中途断线可测续传。
  let i = EVENTS.findIndex((e) => e.id > since);
  if (i < 0) {
    res.end();
    return;
  }
  const timer = setInterval(() => {
    if (i >= EVENTS.length) {
      clearInterval(timer);
      res.end();
      return;
    }
    res.write(`id: ${EVENTS[i].id}\ndata: ${EVENTS[i].data}\n\n`);
    i++;
  }, 20);
  req.on("close", () => clearInterval(timer));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;

function subscribe(since, maxEvents) {
  return new Promise((resolve, reject) => {
    const got = [];
    const req = http.get(
      { host: "127.0.0.1", port, path: "/tasks/1/stream", headers: since ? { "Last-Event-ID": String(since) } : {} },
      (res) => {
        let buf = "";
        res.on("data", (c) => {
          buf += c;
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const id = Number(/id: (\d+)/.exec(frame)?.[1]);
            const data = /data: (.*)/.exec(frame)?.[1];
            got.push({ id, data });
            if (got.length >= maxEvents) {
              req.destroy();
              resolve(got);
              return;
            }
          }
        });
        res.on("end", () => resolve(got));
      },
    );
    req.on("error", () => resolve(got)); // 客户端主动断线
  });
}

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// S1：首次订阅拿前 2 个后断线。
const first = await subscribe(0, 2);
check("S1 首连收到前2个", first.length === 2 && first[1].id === 2, JSON.stringify(first));

// S2：带 Last-Event-ID=2 重连，只收到 3、4，无重复无丢失。
const resumed = await subscribe(2, 10);
const ids = resumed.map((e) => e.id);
check("S2 续传无丢无重", JSON.stringify(ids) === "[3,4]", JSON.stringify(ids));

// S3：全量一次订阅即 1-4（对照：不断线形状）。
const full = await subscribe(0, 10);
check("S3 全量顺序完整", JSON.stringify(full.map((e) => e.id)) === "[1,2,3,4]");

srv.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
