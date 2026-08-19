// P0-01 验收实验：真实端口压测 + SLI 窗口计算。
// 与 handler 微基准（app.request()）不同，这里的请求真正经过 node http server
// 的 socket 监听 → 路由 → 响应。结束后拉 /metrics snapshot 验证：
//   1) 200/404/400/500 都进入按 operation+outcome 分组的延迟分布（404 不漏记）；
//   2) 从同一份计数器算 SLI（good / total）与 error budget，而不是事后另一个口径。
import { serve } from "@hono/node-server";
import { BoundedInMemoryStore } from "../src/store.ts";
import { Metrics } from "../src/metrics.ts";
import { createApp } from "../src/app.ts";

const PORT = 4111;
const WINDOW = "3s（本机实时窗口，非月度）";
const THRESHOLD_P99_MS = 100;

const mk = () =>
  fetch(`http://127.0.0.1:${PORT}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sku: "sku-9", customerId: 7, qty: 3, idempotencyKey: crypto.randomUUID() }),
  });

async function main() {
  const metrics = new Metrics();
  const server = serve(
    { fetch: createApp(new BoundedInMemoryStore(), metrics).fetch, port: PORT },
    () => console.log(`listening on 127.0.0.1:${PORT}`),
  );

  await new Promise((r) => setTimeout(r, 200));
  const t0 = performance.now();

  // 四类真实请求：200（创建+读取）、404、400（非法 body）、409（同 key 异 body）
  const keyFor409 = "k409-shared-timestamp";
  await fetch(`http://127.0.0.1:${PORT}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sku: "sku-seed", customerId: 7, qty: 1, idempotencyKey: keyFor409 }),
  }); // 预创建该 key，使后续同 key 异 body 全部命中 409
  const statuses = Array.from({ length: 120 }, (_, i) => {
    const kind = i % 4;
    if (kind === 0) return fetch(`http://127.0.0.1:${PORT}/orders/${crypto.randomUUID()}`);           // 404
    if (kind === 1) return mk();                                                                      // 201
    return fetch(`http://127.0.0.1:${PORT}/orders`, {                                                  // 400/409
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        kind === 2
          ? { sku: "", customerId: -1, qty: 999, idempotencyKey: "x" }                          // 400
          : { sku: "sku-9", customerId: 7, qty: 3, idempotencyKey: keyFor409 },                 // 409（同 key 异 body）
      ),
    });
  });
  const responses = await Promise.all(statuses);
  const got = responses.map((r) => r.status);
  await Promise.all(responses.map((r) => r.text()));
  const ms = performance.now() - t0;

  const snapshot = metrics.snapshot();
  const total = got.length;
  const good = got.filter((s) => s >= 200 && s < 400).length;
  const s1 = got.filter((s) => s === 404).length;
  const s4 = got.filter((s) => s === 400).length;
  const s9 = got.filter((s) => s === 409).length;
  const count5xx = got.filter((s) => s >= 500).length;

  console.log(`端口压测: ${total} 个并发真实 HTTP 请求 耗时=${ms.toFixed(0)}ms`);
  console.log(`  状态分布: 2xx=${good} 404=${s1} 400=${s4} 409=${s9} 5xx=${count5xx}`);

  // P0-01 验收点 2 前置：SLI 分母定义不同，结果就不同——同一份样本，两种口径
  const sliBusiness = (good + s1 + s4 + s9) / total; // 业务分支都算“正确处理”
  const sliSuccess = good / total;                   // 只有 200 系算 good event
  console.log(`  分母口径A(所有业务分支=good): SLI=${(sliBusiness * 100).toFixed(2)}%`);
  console.log(`  分母口径B(仅2xx=good):       SLI=${(sliSuccess * 100).toFixed(2)}%`);
  console.log(`  SLI(good/total 口径B): ${good}/${total} = ${(good / total * 100).toFixed(2)}% 窗口=${WINDOW}`);

  const perOutcome: Record<string, { n: number; p50: string; p99: string }[]> = {};
  for (const [op, byOutcome] of Object.entries(snapshot.latencies)) {
    perOutcome[op] = Object.entries(byOutcome as Record<string, { n: number; p50: number; p99: number }>)
      .map(([outcome, s]) => ({ out: outcome, n: s.n, p50: s.p50.toFixed(2), p99: s.p99.toFixed(2) }));
  }
  for (const [op, rows] of Object.entries(perOutcome)) {
    for (const r of rows) {
      console.log(`  分布 ${op}.${r.out}: n=${r.n} p50=${r.p50}ms p99=${r.p99}ms`);
    }
  }

  // P0-01 验收点 1：404 必须进分布（旧实现把 GET/POST 混进一个数组且可能漏记）
  const ordersGet = snapshot.latencies["orders_get"] as Record<string, { n: number }> | undefined;
  const notFoundProbe = ordersGet?.["not_found"]?.n ?? 0;
  console.log(`验收1 404进orders_get分布: not_found样本数=${notFoundProbe} (期望>=30)`);
  const conflictOk = snapshot.latencies["orders_create"]?.["conflict"] as { n: number } | undefined;
  console.log(`验收1b 409进orders_create.conflict分布: ${conflictOk?.n ?? 0} (期望>=29)`);

  // P0-01 验收点 2：error budget 从与 SLI 相同的样本计算，不另造分母
  const budget = 1 - good / total;
  const ok99 = budget <= 0.01;
  console.log(`验收2 error budget(1-SLI口径B)=${(budget * 100).toFixed(2)}% → 候选SLO 99%: ${ok99 ? "达标" : "未达标"} (仅当窗口覆盖足够样本时才有意义)`);

  // P0-01 验收点 3：p99 与阈值比较——注意这是 3 秒本机窗口，不是月度 p99
  const createOk = snapshot.latencies["orders_create"]?.["ok"] as { p99: number } | undefined;
  const p99 = createOk?.p99 ?? 0;
  console.log(`验收3 orders_create.ok p99=${p99.toFixed(2)}ms vs 候选阈值 ${THRESHOLD_P99_MS}ms → ${p99 < THRESHOLD_P99_MS ? "低于阈值" : "超阈值"}（仅当前窗口，不构成月度承诺）`);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log("server closed");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });