#!/usr/bin/env node
// AbortSignal 能取消什么、不能取消什么：以"扣款工具"为模型，
// 在三个不同时机触发 cancel，对照调用方结果与不可撤销副作用的账本。
// 零依赖；真实 HTTP 对照见 real-http.mjs。
class AbortedError extends Error {
  constructor() { super("This operation was aborted"); }
}
const makeSignal = () => {
  const listeners = new Set();
  const signal = {
    aborted: false,
    throwIfAborted() { if (signal.aborted) throw new AbortedError(); },
    addEventListener(fn) { listeners.add(fn); },
  };
  return { signal, cancel() { signal.aborted = true; listeners.forEach((f) => f()); } };
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// 工具实现 A：在两个检查点之间提交不可撤销副作用（真实世界的常态）
async function chargeToolWithChecks(signal, ledger) {
  signal.throwIfAborted(); // checkpoint A：出发前
  ledger.push("charged"); // ← 不可撤销副作用一旦执行就无法回滚
  await delay(5);
  signal.throwIfAborted(); // checkpoint B：事后才发现被取消
  return "receipt-1";
}

// 工具实现 B：完全不配合取消——只看自己的业务逻辑
async function chargeToolIgnoringSignal(_signal, ledger) {
  await delay(5);
  ledger.push("charged");
  return "receipt-1";
}

async function runner(toolName, cancelAfterMs) {
  const ledger = [];
  const { signal, cancel } = makeSignal();
  // null 表示从不取消；setTimeout(fn, null) 会把 null 当 0 立即触发——这里必须显式跳过
  const timer = cancelAfterMs === null ? null : setTimeout(cancel, cancelAfterMs);
  let callerSaw;
  try {
    const tool = toolName === "checks" ? chargeToolWithChecks : chargeToolIgnoringSignal;
    callerSaw = await tool(signal, ledger);
  } catch (e) {
    callerSaw = e.constructor.name;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return { callerSaw, ledger };
}

const rows = [];
for (const [name, tool] of [["checks(配合取消)", "checks"], ["ignore(不配合)", "ignore"]]) {
  // 相位 1：调用前信号已中止——唯一的"零副作用"路径
  {
    const ledger = [];
    const { signal } = makeSignal();
    signal.aborted = true;
    let saw;
    try {
      const t = tool === "checks" ? chargeToolWithChecks : chargeToolIgnoringSignal;
      saw = await t(signal, ledger);
    } catch (e) { saw = e.constructor.name; }
    rows.push({ callerSaw: saw, ledger });
  }
  rows.push(await runner(tool, null)); // 相位 2：不取消
  rows.push(await runner(tool, 2)); // 相位 3：副作用已提交(t≈0)、checkpoint B(t≈5ms)之前取消
}

console.log("Node", process.version, "· 确定性模拟 · delay=5ms");
console.log("| 工具实现 | 取消时机 | 调用方看到 | 扣款账本 |");
console.log("| --- | --- | --- | --- |");
const labels = ["调用前已中止", "不取消", "t=2ms(副作用后)"];
rows.forEach((r, i) => {
  const tool = i < 3 ? "checks(配合取消)" : "ignore(不配合)";
  console.log(`| ${tool} | ${labels[i % 3]} | ${r.callerSaw} | [${r.ledger.join(",") || "空"}] |`);
});
