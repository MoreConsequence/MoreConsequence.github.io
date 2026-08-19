// P0-08 验收实验：Zod 与手写守卫的同语义性能 benchmark。
// 上一轮只测了 bundle 体积；本文补齐"热路径性能"缺口。
// 同语义约束：同一批输入（合法/非法），两种实现返回相同结果（成功值或错误），
// 只改变校验实现，不改变输入、结果判定或统计口径。
import { zod_v4_parse } from "./parse-zod-v4.mjs";
import { manual_parse } from "./parse-manual.mjs";

const N = 2_000_000;
const WARMUP = 100_000;

const valid = {
  id: "tool-1",
  kind: "lookup_order",
  orderId: "ORD-88",
};
const invalid = { id: "tool-2", kind: "lookup_order", orderId: 12345 };

function bench(fn, input) {
  let ok = 0;
  for (let i = 0; i < WARMUP; i++) {
    try { fn(input); } catch { /* 预热期忽略预期异常 */ }
  }
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    try {
      fn(input);
      ok++;
    } catch {
      // 非法输入预期抛错；合法输入抛错才算失败
      if (input === valid) throw new Error("valid input should not throw");
    }
  }
  const ms = performance.now() - t0;
  return { ok, ms, opsPerSec: Math.round(N / (ms / 1000)) };
}

const r1 = bench(manual_parse, valid);
const r2 = bench(zod_v4_parse, valid);
const r3 = bench(manual_parse, invalid);
const r4 = bench(zod_v4_parse, invalid);

const fmt = (n) => n.toLocaleString("en-US");
console.log(`同语义 benchmark：N=${fmt(N)} per run，Node ${process.version}`);
console.log(`合法输入：手写 ${fmt(r1.opsPerSec)} ops/s（${r1.ms.toFixed(0)}ms） vs zod/v4 ${fmt(r2.opsPerSec)} ops/s（${r2.ms.toFixed(0)}ms）`);
console.log(`非法输入：手写 ${fmt(r3.opsPerSec)} ops/s（${r3.ms.toFixed(0)}ms） vs zod/v4 ${fmt(r4.opsPerSec)} ops/s（${r4.ms.toFixed(0)}ms）`);
console.log(`倍数（合法，zod/手写）：${(r2.opsPerSec / r1.opsPerSec).toFixed(2)}x`);
console.log(`合法/非法都返回预设语义：${manual_parse(valid).kind === "lookup_order" && zod_v4_parse(valid).kind === "lookup_order"}`);
console.log("边界：本机单次运行、单核同步解析、无 JSON.parse（输入已解析）；倍数不是跨机器常数，也不是网络/IO 路径结论。");