// EventEmitter 同步 emit vs AsyncEventEmitter 串行 await vs BroadcastChannel 跨 worker。
// 运行：node demo.mjs
import { EventEmitter } from "node:events";
import { Worker } from "node:worker_threads";

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// E1：EventEmitter.emit 是同步的——监听器全跑完 emit 才返回。
const order1 = [];
const ee = new EventEmitter();
ee.on("x", () => { order1.push("L1"); });
ee.on("x", () => { order1.push("L2"); });
ee.emit("x");
order1.push("after-emit");
check("E1 emit 同步：监听器先于 emit 返回", order1.join(",") === "L1,L2,after-emit", order1.join(","));

// E2：async 监听器的 Promise 不被 emit 等待——返回 true 但副作用还没完。
const order2 = [];
const ee2 = new EventEmitter();
ee2.on("x", async () => { await new Promise((r) => setTimeout(r, 30)); order2.push("async-done"); });
ee2.emit("x");
check("E2 emit 不等 async 监听器", order2.length === 0, `pending=${order2.length}`);
await new Promise((r) => setTimeout(r, 60));
check("E2b async 副作用稍后到达", order2.join(",") === "async-done", order2.join(","));

// E3：AsyncEventEmitter（Node 22.5+）串行 await 每个监听器。
let asyncEE = null;
try {
  const { AsyncEventEmitter } = await import("node:events");
  asyncEE = AsyncEventEmitter ?? null;
} catch { /* older node */ }
if (asyncEE) {
  const order3 = [];
  const aee = new asyncEE();
  aee.on("x", async () => { await new Promise((r) => setTimeout(r, 20)); order3.push("first"); });
  aee.on("x", () => { order3.push("second"); });
  await aee.emit("x");
  check("E3 AsyncEventEmitter 串行等待", order3.join(",") === "first,second", order3.join(","));
} else {
  console.log("SKIP E3 AsyncEventEmitter 不可用（需 Node 22.5+）");
}

// E4：BroadcastChannel 同名跨 worker 投递（结构化克隆，非共享内存）。
const bcGot = await new Promise((resolve, reject) => {
  const bc = new BroadcastChannel("demo-bus");
  const w = new Worker(
    `const bc = new BroadcastChannel('demo-bus'); bc.postMessage({ hello: 'worker' }); bc.close();`,
    { eval: true },
  );
  const t = setTimeout(() => reject(new Error("timeout")), 3000);
  bc.onmessage = (ev) => { clearTimeout(t); bc.close(); w.terminate().then(() => resolve(ev.data)); };
  w.on("error", reject);
});
check("E4 BroadcastChannel 跨 worker 收到", bcGot?.hello === "worker", JSON.stringify(bcGot));
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
