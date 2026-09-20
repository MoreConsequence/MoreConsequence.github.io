// child_process.fork 多进程任务分发：shared-nothing，消息全走 IPC 序列化。
// 运行：node demo.mjs
import { fork } from "node:child_process";

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// 子进程分支：同一文件，argv[2]==='child' 时当 worker 跑。
if (process.argv[2] === "child") {
  process.on("message", (msg) => {
    if (msg.cmd === "square") {
      // 故意改一个模块级变量，证明父子内存不共享。
      globalThis.__marker = (globalThis.__marker ?? 0) + 1;
      process.send({ id: msg.id, result: msg.n * msg.n, pid: process.pid, marker: globalThis.__marker });
    }
  });
  process.send({ ready: true, pid: process.pid });
} else {
  const N_CHILDREN = 2;
  const TASKS = [3, 7, 11, 13, 17, 19];
  const children = [];
  const results = new Map();

  const spawnOne = () => new Promise((resolve, reject) => {
    const c = fork(process.argv[1], ["child"], { silent: true });
    c.on("message", (m) => { if (m.ready) resolve(c); });
    c.on("error", reject);
  });
  for (let i = 0; i < N_CHILDREN; i++) children.push(await spawnOne());
  check("C1 子进程 PID 与父不同", children.every((c) => c.pid !== process.pid), children.map((c) => c.pid).join(","));

  let next = 0;
  await Promise.all(children.map((c) => new Promise((res) => {
    const pending = new Map();
    c.on("message", (m) => {
      if (m.id !== undefined) {
        pending.delete(m.id);
        results.set(m.id, m);
        if (next < TASKS.length) {
          const id = next++;
          pending.set(id, true);
          c.send({ cmd: "square", id, n: TASKS[id] });
        } else if (pending.size === 0) res();
      }
    });
    // 每 child 先发一个
    const id = next++;
    pending.set(id, true);
    c.send({ cmd: "square", id, n: TASKS[id] });
  })));

  const got = TASKS.map((n, i) => results.get(i)?.result);
  const want = TASKS.map((n) => n * n);
  console.log(`结果=${got.join(",")} 期望=${want.join(",")}`);
  check("C2 6 个任务全回且平方正确", JSON.stringify(got) === JSON.stringify(want));
  check("C3 至少两个不同 worker PID 干活", new Set([...results.values()].map((r) => r.pid)).size >= 2);
  for (const c of children) c.kill();
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures ? 1 : 0);
}
