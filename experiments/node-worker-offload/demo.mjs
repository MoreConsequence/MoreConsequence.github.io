// 主线程 busy 50ms vs worker 下放：timer 延迟对照。
// 只用内置 worker_threads。运行：node demo.mjs
import { Worker } from "node:worker_threads";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function busy(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end);
}
async function timerError(delay, block) {
  const t0 = Date.now();
  const p = sleep(delay).then(() => Date.now() - t0 - delay);
  block();
  return p;
}
function offload(ms) {
  return new Promise((resolve, reject) => {
    const w = new Worker(`const end = Date.now() + ${ms}; while (Date.now() < end); require('node:worker_threads').parentPort.postMessage('done');`, { eval: true });
    w.on("message", () => resolve(w.terminate().then(() => {})));
    w.on("error", reject);
  });
}

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

const base = await timerError(10, () => {});
const blocked = await timerError(10, () => busy(50));
const freed = await timerError(10, () => {});
await offload(50); // 预热 worker
const offloaded = await timerError(10, () => {});
// 注意：offloaded 的 block 是空函数——真正的对照在下一行：busy 放 worker 里，timer 照跑。
const t0 = Date.now();
const timerP = sleep(10).then(() => Date.now() - t0 - 10);
await offload(50);
const duringWorker = await timerP;

console.log(`基线误差=${base}ms 主线程busy50ms误差=${blocked}ms 空闲误差=${freed}ms worker忙时timer误差=${duringWorker}ms`);
check("W1 主线程 busy 推迟 timer", blocked >= 40, `${blocked}ms`);
check("W2 CPU 下放后 timer 不受影响", duringWorker < 20, `${duringWorker}ms`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
