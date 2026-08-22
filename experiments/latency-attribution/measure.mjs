#!/usr/bin/env node
// 三段归因实验：客户端观测延迟 = 连接建立 + 服务端思考 + 响应传输。
// 方法：每轮只改一个变量（连接复用 / think 时间 / body 大小），其余锁死，
// 用相邻两轮的分布差值给对应段记账。零依赖，Node >= 18。
import http from "node:http";

const N = 300; // 每轮请求数
let listenPort = 0; // 由 OS 分配，避免端口冲突影响复跑

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const think = Number(url.searchParams.get("think") ?? 0);
  const size = Number(url.searchParams.get("size") ?? 64);
  const body = Buffer.alloc(size, 0x61);
  const send = () => {
    res.writeHead(200, { "content-type": "text/plain", "content-length": size });
    res.end(body);
  };
  if (think > 0) setTimeout(send, think);
  else send();
});

const once = (agent, url) =>
  new Promise((resolve, reject) => {
    const t0 = performance.now();
    const req = http.request(url, { agent }, (res) => {
      res.resume();
      res.on("end", () => resolve(performance.now() - t0));
    });
    req.on("error", reject);
    req.end();
  });

async function phase({ label = "", keepAlive, think, size }) {
  const agent = new http.Agent({
    keepAlive,
    maxSockets: 1, // 锁死并发路径：串行请求，排除排队干扰
  });
  await once(agent, `http://127.0.0.1:${listenPort}/warm`); // 预热：JIT、DNS、首连
  const xs = [];
  for (let i = 0; i < N; i++) {
    xs.push(await once(agent, `http://127.0.0.1:${listenPort}/p?think=${think}&size=${size}`));
  }
  agent.destroy();
  xs.sort((a, b) => a - b);
  const p = (q) => xs[Math.floor(q * (xs.length - 1))];
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return { label, mean, p50: p(0.5), p95: p(0.95), min: xs[0] };
}

server.listen(listenPort, "127.0.0.1", async () => {
  listenPort = server.address().port;
  const port = server.address().port;
  // 全局预热后，四个阶段各自只相对基线改变一个变量
  const run = (over) => phase({ keepAlive: true, think: 0, size: 64, ...over });

  const rows = [];
  rows.push(await run({ label: "A 基线: 复用连接+0ms+64B" }));
  rows.push(await run({ label: "B 每次新建连接", keepAlive: false }));
  rows.push(await run({ label: "C 服务端思考 25ms", think: 25 }));
  rows.push(await run({ label: "D 传输 5MB body", size: 5_000_000 }));

  console.log(`Node ${process.version} · darwin/arm64 · loopback · N=${N}/phase · 串行 maxSockets=1`);
  console.log("| 阶段 | mean(ms) | p50(ms) | p95(ms) | min(ms) |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of rows) {
    console.log(`| ${r.label} | ${r.mean.toFixed(3)} | ${r.p50.toFixed(3)} | ${r.p95.toFixed(3)} | ${r.min.toFixed(3)} |`);
  }
  const d = (i) => (rows[i].mean - rows[0].mean).toFixed(3);
  console.log("");
  console.log(`归因(均值差, 相对A): 连接段 +${d(1)}ms · 思考段 +${d(2)}ms · 传输段 +${d(3)}ms`);
  server.close();
});
