#!/usr/bin/env node
// 真实 HTTP 对照：客户端在响应到达前 abort，服务端是否仍然处理了请求？
import http from "node:http";

const server = http.createServer((req, res) => {
  const t0 = Date.now();
  setTimeout(() => {
    // 服务端"业务副作用"：写一条审计日志（此处用 stderr 记录代替）
    console.log(`SERVER_APPLIED id=${req.url.slice(1)} at=${t0}`);
    res.end("ok");
  }, 30);
});

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  const ac = new AbortController();
  setTimeout(() => ac.abort(new Error("user gave up")), 10); // 服务端 30ms 才应用副作用

  let clientResult;
  const t0 = performance.now();
  try {
    await fetch(`http://127.0.0.1:${port}/order-1`, { signal: ac.signal });
    clientResult = "ok";
  } catch (e) {
    clientResult = `${e.name}`;
  }
  console.log(`CLIENT Saw: ${clientResult} after ${(performance.now() - t0).toFixed(1)}ms`);

  // 给服务端时间完成它的 setTimeout——证明取消不影响已到达的请求
  await new Promise((r) => setTimeout(r, 80));
  server.close();
});
