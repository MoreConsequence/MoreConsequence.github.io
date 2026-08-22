#!/usr/bin/env node
// Agent 会话预算：三种刹车策略的超支与产出对照。
// 每步成本在执行前不完全已知（工具输出长度波动）——这正是"到限才刹必超支"的根源。
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SESSIONS = 300;
const FIXED_RESERVE = 30_000; // 运营先验：步长分布的 P99（含尖峰）
const BUDGET = 100_000; // token 预算
const BASE_STEP = 6_000; // 基础步长
const SPIKE_P = 0.15; // 工具输出尖峰概率
const SPIKE_MAX = 30_000; // 尖峰上限

// 单步成本：执行前只知道"基础值"，尖峰只有执行后才知道
const stepCost = (rand) => BASE_STEP + (rand() < SPIKE_P ? Math.floor(rand() * SPIKE_MAX) : rand() * 4_000);

function session(strategy, seed) {
  const rand = rng(seed);
  let spent = 0, steps = 0, maxSeen = BASE_STEP;
  while (true) {
    const est = strategy === "reserve" ? maxSeen : strategy === "preflight" ? maxSeen : null;
    if (strategy === "naive" && spent >= BUDGET) break;
    if (strategy === "reserve-fixed" && spent + FIXED_RESERVE > BUDGET) break;
    if (strategy === "reserve" && spent + est > BUDGET) break; // 按"最坏一步"留满余量
    if (strategy === "preflight") {
      // 执行前估计下一步成本为近期最大值的 80%，估完仍超预算才停
      if (spent + Math.floor(est * 0.8) > BUDGET) break;
    }
    const c = stepCost(rand);
    spent += c;
    steps += 1;
    maxSeen = Math.max(maxSeen, c);
  }
  return { spent, steps };
}

const summarize = (name) => {
  let over = 0, overSum = 0, stepsSum = 0;
  for (let s = 1; s <= SESSIONS; s++) {
    const r = session(name, s * 7919);
    if (r.spent > BUDGET) { over++; overSum += r.spent - BUDGET; }
    stepsSum += r.steps;
  }
  return {
    name,
    overRate: ((over / SESSIONS) * 100).toFixed(1),
    meanOvershoot: over ? Math.round(overSum / over) : 0,
    // eslint-disable
    maxOver: Math.round((() => { let m = 0; for (let s = 1; s <= SESSIONS; s++) m = Math.max(m, Math.max(0, session(name, s * 7919).spent - BUDGET)); return m; })()),
    meanSteps: (stepsSum / SESSIONS).toFixed(1),
  };
};

console.log(`sessions=${SESSIONS} · budget=${BUDGET} tok · base_step=${BASE_STEP} · spike p=${SPIKE_P} max=${SPIKE_MAX}`);
console.log("");
console.log("| 策略 | 超支会话比例 | 平均超支(tok) | 最大超支(tok) | 平均完成步数 |");
console.log("| --- | --- | --- | --- | --- |");
for (const name of ["naive", "reserve", "preflight", "reserve-fixed"]) {
  const s = summarize(name);
  console.log(`| ${name} | ${s.overRate}% | ${s.meanOvershoot} | ${s.maxOver} | ${s.meanSteps} |`);
}
