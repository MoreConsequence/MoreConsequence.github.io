// SharedArrayBuffer + Atomics：跨 worker 计数器，race vs 原子对照。
// 只用内置 worker_threads。运行：node demo.mjs
import { Worker } from "node:worker_threads";

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

const N_WORKERS = 4;
const N_INCR = 25000;
const EXPECTED = N_WORKERS * N_INCR;

function runWorkers(useAtomics) {
  return new Promise((resolve, reject) => {
    const sab = new SharedArrayBuffer(4);
    const view = new Int32Array(sab);
    let done = 0;
    for (let i = 0; i < N_WORKERS; i++) {
      const w = new Worker(
        `
        const { parentPort, workerData } = require('node:worker_threads');
        const view = new Int32Array(workerData.sab);
        const { n, atomic } = workerData;
        for (let i = 0; i < n; i++) {
          if (atomic) Atomics.add(view, 0, 1);
          else view[0] = view[0] + 1; // 非原子读-改-写：注定丢更新
        }
        parentPort.postMessage('done');
        `,
        { eval: true, workerData: { sab, n: N_INCR, atomic: useAtomics } },
      );
      w.on("message", () => {
        w.terminate();
        if (++done === N_WORKERS) resolve(view[0]);
      });
      w.on("error", reject);
    }
  });
}

const racy = await runWorkers(false);
const atomic = await runWorkers(true);
console.log(`非原子结果=${racy} 原子结果=${atomic} 期望=${EXPECTED}`);
check("S1 非原子递增丢更新", racy < EXPECTED, `${racy}/${EXPECTED}`);
check("S2 Atomics.add 精确命中", atomic === EXPECTED, `${atomic}/${EXPECTED}`);

// S3：Atomics.wait/notify 做一次跨线程握手（flag 位）。
const hs = await new Promise((resolve, reject) => {
  const sab = new SharedArrayBuffer(8);
  const view = new Int32Array(sab);
  const w = new Worker(
    `
    const { parentPort, workerData } = require('node:worker_threads');
    const view = new Int32Array(workerData.sab);
    Atomics.wait(view, 0, 0, 2000); // 等主线程把 view[0] 置 1
    Atomics.store(view, 1, 42);
    Atomics.notify(view, 1, 1);
    parentPort.postMessage('done');
    `,
    { eval: true, workerData: { sab } },
  );
  w.on("message", () => w.terminate().then(() => resolve(view[1])));
  w.on("error", reject);
  setTimeout(() => {
    Atomics.store(view, 0, 1);
    Atomics.notify(view, 0, 1);
  }, 50);
});
console.log(`握手回传=${hs}`);
check("S3 wait/notify 握手回传 42", hs === 42, `${hs}`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
