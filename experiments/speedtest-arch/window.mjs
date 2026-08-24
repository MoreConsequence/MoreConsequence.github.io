#!/usr/bin/env node
// 测速客户端的核心算法实验：同一份字节流，三种吞吐估计器差多少？
// 服务端模拟 TCP 慢启动：先爬坡后满速。零依赖，Node >= 18。
import http from "node:http";

const RAMP_MS = 1200;          // 爬坡期
const RAMP_BPS = 4 * 1024 * 1024;   // 爬坡期速率 4MB/s
const STEADY_BPS = 24 * 1024 * 1024; // 满速期 24MB/s
const TOTAL_MS = 3600;         // 总传输时长
const CHUNK = 64 * 1024;

const server = http.createServer((req, res) => {
  const t0 = Date.now();
  let sent = 0;
  const timer = setInterval(() => {
    const elapsed = Date.now() - t0;
    if (elapsed >= TOTAL_MS || !res.writable) {
      clearInterval(timer);
      res.end();
      return;
    }
    // 逐 tick 定额：每 tick 只发"本 tick 预算"，不追累计目标（否则欠账补发会制造假尖峰）。
    // 忽略 write() 返回值：loopback 消费极快，socket 缓冲只是暂态（边界见 README）
    const bps = elapsed < RAMP_MS ? RAMP_BPS : STEADY_BPS;
    const budget = Math.floor((bps * 20) / 1000);
    for (let off = 0; off < budget; off += CHUNK) {
      res.write(Buffer.alloc(Math.min(CHUNK, budget - off), 0x61));
    }
  }, 20);
  res.on("close", () => clearInterval(timer));
});

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  const samples = []; // {t, bytes}
  let got = 0;
  const t0 = performance.now();
  const ac = new AbortController();
  const sampler = setInterval(() => samples.push({ t: performance.now() - t0, b: got }), 50);
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: ac.signal })
      .then(async (r) => { const reader = r.body.getReader(); for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; } });
  } catch { /* ignore */ }
  clearInterval(sampler);
  const tEnd = performance.now() - t0;

  const naive = (got / tEnd) * 1000;
  const DISCARD = 1400; // 抛弃起步段：> RAMP_MS
  const after = samples.filter((s) => s.t >= DISCARD);
  const discarded = ((got - after[0].b) / (tEnd - after[0].t)) * 1000;
  const W = 800; // 滚动窗口
  let sliding = 0;
  for (const s of samples) {
    const wEnd = s.t + W;
    const later = samples.find((x) => x.t >= wEnd);
    if (later) sliding = Math.max(sliding, ((later.b - s.b) / (later.t - s.t)) * 1000);
  }
  const mbps = (v) => ((v * 8) / 1e6).toFixed(1);

  console.log(`配置满速 ${(STEADY_BPS * 8) / 1e6} Mbps · 爬坡 ${RAMP_MS}ms@${(RAMP_BPS * 8) / 1e6}Mbps · 总时长 ${TOTAL_MS}ms`);
  console.log(`| 估计器 | 结果(Mbps) | 相对满速误差 |`);
  console.log(`| --- | --- | --- |`);
  console.log(`| 全程平均(天真) | ${mbps(naive)} | ${(((naive - STEADY_BPS) / STEADY_BPS) * 100).toFixed(1)}% |`);
  console.log(`| 抛弃前 ${DISCARD}ms | ${mbps(discarded)} | ${(((discarded - STEADY_BPS) / STEADY_BPS) * 100).toFixed(1)}% |`);
  console.log(`| ${W}ms 滚动窗口取最大 | ${mbps(sliding)} | ${(((sliding - STEADY_BPS) / STEADY_BPS) * 100).toFixed(1)}% |`);
  server.close();
});
