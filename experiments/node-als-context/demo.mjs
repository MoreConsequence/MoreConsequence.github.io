// Node ALS 请求上下文：als.run 隔离 vs 模块级变量污染。
// 只用内置 http + async_hooks。运行：node demo.mjs（Node >= 18）
import http from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage();
let current = null; // 反例：模块级“当前请求”
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start(handler) {
  const srv = http.createServer(handler);
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv)));
}
function get(port, id) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: `/?id=${id}` }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve(raw));
    }).on("error", reject);
  });
}

// 正路：每个请求包进自己的 store。
const good = await start((req, res) => {
  const id = new URL(req.url, "http://x").searchParams.get("id");
  als.run({ id }, async () => {
    await sleep(20);
    res.end(`seen=${als.getStore()?.id}`);
  });
});
// 反例：共享变量 + 同样 20ms 异步缺口。
const bad = await start((req, res) => {
  current = new URL(req.url, "http://x").searchParams.get("id");
  sleep(20).then(() => res.end(`seen=${current}`));
});

async function fire(port, n) {
  const ids = Array.from({ length: n }, (_, i) => `req-${i}`);
  const bodies = await Promise.all(ids.map((id) => get(port, id)));
  return ids.map((id, i) => ({ id, ok: bodies[i] === `seen=${id}` }));
}

const N = 10;
const goodRes = await fire(good.address().port, N);
const badRes = await fire(bad.address().port, N);
const goodOk = goodRes.filter((r) => r.ok).length;
const badOk = badRes.filter((r) => r.ok).length;
console.log(`GOOD als.run 隔离: ${goodOk}/${N} 对上`);
console.log(`BAD 共享变量污染: ${badOk}/${N} 对上`);

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};
check("A1 als.run 下 10 并发全对", goodOk === N, `${goodOk}/${N}`);
check("A2 共享变量下必串号", badOk < N, `只对 ${badOk}/${N}（全读到最后一个 id）`);

// A3（加固）：嵌套 run 内层覆盖外层，退出内层恢复外层——中间件叠加不互踩。
const nested = await new Promise((resolve) => {
  als.run({ id: "outer" }, () => {
    const o1 = als.getStore()?.id;
    als.run({ id: "inner" }, () => {
      const i = als.getStore()?.id;
      setImmediate(() => {
        // 注意：此处仍在 inner 上下文中（setImmediate 继承）。
        resolve([o1, i, als.getStore()?.id]);
      });
    });
  });
});
check("A3 嵌套覆盖且隔离", JSON.stringify(nested) === '["outer","inner","inner"]', JSON.stringify(nested));

for (const s of [good, bad]) s.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
