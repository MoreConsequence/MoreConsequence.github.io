// 账单敏感度模型：同一 workload 在不同价格结构下的成本。
// 价格是 2026-09-13 第三方 tracker 快照的假设输入（见正文边界），本脚本只证明数学敏感度。
// 运行：node bill.mjs（零依赖，Node >= 18）
const ROUNDS = 8; // 每任务 8 轮工具调用
const FRESH = 6000; // 每轮新增输入（工具回包等）
const PREFIX = 40000; // 稳定前缀（系统提示 + 仓库上下文）
const OUT_LEAN = 1200; // 精简输出/轮
const OUT_BLOATED = 3600; // 膨胀输出/轮（3x，模拟啰嗦推理机型）
const TASKS_PER_DAY = 1000;
const DAYS = 30;

// 价格快照（$/M token）：[输入, 缓存命中, 输出]，2026-09-13 假设输入
const PLANS = {
  "A flagship 10/50 + cache0.25": [10, 0.25, 50],
  "B flagship 10/50 + cache1.25": [10, 1.25, 50],
  "C value 1.25/4.25 + cache0.3": [1.25, 0.3, 4.25],
  "D flash 0.75/3.75 + cache0.2": [0.75, 0.2, 3.75],
};
const LONGCTX_SURCHARGE = 2; // E：超 200K 上下文部分输入价 ×2（教学参数）

function taskCost(plan, hitRate, outPerRound, longCtx = false, prefixScale = 1) {
  const [pi, pc, po] = PLANS[plan];
  const prefix = PREFIX * prefixScale;
  let cost = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const ctx = prefix + FRESH * (r + 1);
    let rate = pi;
    if (longCtx && ctx > 200000) rate = pi * LONGCTX_SURCHARGE;
    cost += (FRESH * rate + prefix * hitRate * pc + prefix * (1 - hitRate) * rate) / 1e6;
    cost += (outPerRound * po) / 1e6;
  }
  return cost;
}
const month = (c) => c * TASKS_PER_DAY * DAYS;
const fmt = (c) => `$${month(c).toFixed(0)}`;

console.log("workload: 8 轮/任务, 前缀 40K + 新增 6K/轮, 1000 任务/日\n");
console.log("--- 基线：缓存命中 90%，精简输出 ---");
for (const p of Object.keys(PLANS)) console.log(`${p.padEnd(34)} 单任务 $${taskCost(p, 0.9, OUT_LEAN).toFixed(3)} | 月 ${fmt(taskCost(p, 0.9, OUT_LEAN))}`);

console.log("\n--- 同一价格(A)下，输出膨胀 3x vs 缓存命中掉到 50% ---");
const base = taskCost("A flagship 10/50 + cache0.25", 0.9, OUT_LEAN);
const bloat = taskCost("A flagship 10/50 + cache0.25", 0.9, OUT_BLOATED);
const miss = taskCost("A flagship 10/50 + cache0.25", 0.5, OUT_LEAN);
console.log(`基线(90%命中,精简输出)   单任务 $${base.toFixed(3)} | 月 ${fmt(base)}`);
console.log(`输出膨胀3x               单任务 $${bloat.toFixed(3)} | 月 ${fmt(bloat)} (${(bloat / base).toFixed(1)}x)`);
console.log(`缓存命中→50%              单任务 $${miss.toFixed(3)} | 月 ${fmt(miss)} (${(miss / base).toFixed(1)}x)`);

console.log("\n--- 同一 workload，换价格结构（90%命中，精简输出）---");
const costs = Object.keys(PLANS).map((p) => [p, taskCost(p, 0.9, OUT_LEAN)]);
for (const [p, c] of costs) console.log(`${p.padEnd(34)} 单任务 $${c.toFixed(3)} | 月 ${fmt(c)}`);
console.log(`最高/最低 = ${(costs[1][1] / costs[3][1]).toFixed(1)}x（同为“能跑”，月账单差一个数量级）`);

// 加固：Batch 离线半价——同 workload 改走 Batch（输入/输出价×0.5），A 方案月账单直接腰斩。
// 前提是延迟不敏感（小时级返回），在线链路不适用。
const batchTask = taskCost("A flagship 10/50 + cache0.25", 0.9, OUT_LEAN) * 0.5;
console.log(`A 走 Batch：单任务 $${batchTask.toFixed(3)} | 月 ${fmt(batchTask)}（在线 $${(batchTask * 2).toFixed(3)}/任务的一半）`);
// Batch 不改变排序：A 半价后仍贵过 C 在线价——单价主导，折扣只是乘数。
const onlineC = taskCost("C value 1.25/4.25 + cache0.3", 0.9, OUT_LEAN);
console.log(`CHECK Batch半价仍贵过C在线: ${batchTask > onlineC ? "PASS" : "FAIL"} ($${batchTask.toFixed(3)} vs $${onlineC.toFixed(3)})`);

console.log("\n--- 长上下文附加费：整仓前缀 240K（×6），E = A + 超200K部分输入价×2 ---");
const bigBase = taskCost("A flagship 10/50 + cache0.25", 0.9, OUT_LEAN, false, 6);
const e = taskCost("A flagship 10/50 + cache0.25", 0.9, OUT_LEAN, true, 6);
console.log(`A 基线  单任务 $${bigBase.toFixed(3)} | E 长上下文 单任务 $${e.toFixed(3)} (${(e / bigBase).toFixed(2)}x)`);
console.log("注：88K 峰值 workload 不触发 200K 线——附加费只在整仓级上下文任务生效");
