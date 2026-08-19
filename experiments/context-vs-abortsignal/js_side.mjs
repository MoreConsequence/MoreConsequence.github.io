// JS 侧: AbortSignal 取消语义演示

import { setTimeout as sleep } from "node:timers/promises";

async function main() {
  // 1. abort 触发事件回调; 清理要自己监听
  const ac = new AbortController();
  const p = new Promise((_, reject) => {
    ac.signal.addEventListener("abort", () =>
      reject(new DOMException("Aborted", "AbortError"))
    );
  });
  ac.abort();
  try { await p; } catch (e) { console.log("abort reason:", e.name); }

  // 2. timeout: AbortSignal.timeout
  const ts = AbortSignal.timeout(30);
  await sleep(40);
  console.log("timeout aborted:", ts.aborted, "reason:", ts.reason?.name);

  // 3. 传播: 父 abort 会带子一起; 子 abort 不影响父
  const parent = new AbortController();
  const child = new AbortController();
  parent.signal.addEventListener("abort", () => child.abort());
  parent.abort();
  console.log("父 abort → 子 aborted:", child.signal.aborted,
              "| 父 aborted:", parent.signal.aborted);

  // 4. 反向不可: 子 abort 不到父(没有手动 connect 的父子只是两个独立控制器)
  const a = new AbortController(), b = new AbortController();
  b.abort();
  console.log("无关控制器 b abort → a aborted:", a.signal.aborted,
              "| b aborted:", b.signal.aborted);

  // 5. fetch 原生接 abort → 真正取消网络请求
  const ac2 = new AbortController();
  setTimeout(() => ac2.abort(), 5);
  try {
    await fetch("http://127.0.0.1:9/", { signal: ac2.signal });
  } catch (e) {
    console.log("fetch abort:", e.name === "AbortError" || e.code === "ECONNREFUSED" || e.name === "TypeError");
  }
}
main();
