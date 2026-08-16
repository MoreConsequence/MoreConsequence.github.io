import test from "node:test";
import assert from "node:assert/strict";
import { CostLedger, costInMicroUsd, idempotent, runOnce, simulatedRates } from "./prod.ts";

test("runOnce 合并 100 个并发调用", async () => {
  const state = new Map();
  let executions = 0;
  const results = await Promise.all(Array.from({ length: 100 }, () => runOnce("same", async () => {
    executions++;
    await Promise.resolve();
    return "ok";
  }, state)));
  assert.equal(executions, 1);
  assert.deepEqual([...new Set(results)], ["ok"]);
});

test("idempotent 合并并发调用，失败后允许显式重试", async () => {
  const state = new Map();
  let attempts = 0;
  await assert.rejects(() => idempotent("unstable", async () => {
    attempts++;
    throw new Error("temporary");
  }, state), /temporary/);
  const result = await idempotent("unstable", async () => {
    attempts++;
    return "recovered";
  }, state);
  assert.equal(result.value, "recovered");
  assert.equal(result.replayed, false);
  assert.equal(attempts, 2);
});

test("每 1k token 费率按 token 数除以 1000", () => {
  assert.equal(costInMicroUsd(500, 200, simulatedRates), 11_000);
  assert.equal(costInMicroUsd(300, 150, simulatedRates), 7_500);
});

test("成本预算在记账点强制终止", () => {
  const ledger = new CostLedger(simulatedRates, 10_000);
  ledger.charge("get_stock", 300, 150);
  assert.throws(() => ledger.charge("create_order", 500, 200), /budget exceeded/);
});
