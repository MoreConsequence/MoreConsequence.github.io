// 成本模型:同一条业务请求,在多种 prompt 结构下的月度账单
// 价格:OpenAI GPT-4.1 官方定价 2026-08($2/M 输入、$8/M 输出,cached 输入 $0.5/M,75% off)
// 场景:客服 Agent,日均 1 万次请求,每次输出 300 token

const INPUT = 2e-6;     // $2 / 1M 输入 token
const CACHED = 0.5e-6;  // cached 输入
const OUTPUT = 8e-6;    // $8 / 1M 输出 token
const REQS = 10_000;
const DAYS = 30;
const OUT = 300;

function month(desc, sysPrompt, docContext, perReq, cacheHit) {
  const stable = sysPrompt + docContext;
  const uncached = perReq + stable * (1 - cacheHit);
  const cached = stable * cacheHit;
  const cost = (uncached * INPUT + cached * CACHED + OUT * OUTPUT) * REQS * DAYS;
  const input = uncached + cached;
  console.log(
    `${desc.padEnd(30)} 输入/次= ${String(Math.round(input)).padStart(6)} token | 未缓存 ${String(Math.round(uncached)).padStart(6)} | 缓存 ${String(Math.round(cached)).padStart(6)} | 月成本 $${cost.toFixed(0)}`
  );
}

console.log("场景:客服 Agent,1 万次/日,输出恒定 300 token/次\n");
month("裸 prompt(无系统提示)", 0, 0, 40, 0);
month("系统提示,不缓存", 1500, 0, 40, 0);
month("系统提示+文档 RAG,不缓存", 1500, 2000, 40, 0);
month("系统提示+文档,启用缓存", 1500, 2000, 40, 0.9);
month("系统提示+文档 20K,不缓存", 1500, 20000, 40, 0);
month("同上,但文档 20K", 1500, 20000, 40, 0.9);

console.log("\n--- 输入占比:同一条请求,输入 token 从 40 → 2000 ---");
for (const inp of [40, 500, 2000, 20000]) {
  const cost = (inp * INPUT + OUT * OUTPUT) * REQS * DAYS;
  console.log(`输入 ${String(inp).padStart(5)} token/次 → 月 $${cost.toFixed(0)}`);
}

console.log("\n--- 输出才是大头的场景(生成型任务) ---");
for (const o of [100, 300, 1000]) {
  const cost = (2000 * INPUT + o * OUTPUT) * REQS * DAYS;
  console.log(`输出 ${String(o).padStart(5)} token/次(输入恒 2K)→ 月 $${cost.toFixed(0)}`);
}
