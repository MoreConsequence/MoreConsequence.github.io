// Generated runtime equivalent of prod.ts. Run the TypeScript source for the typed example.
import { pathToFileURL } from "node:url";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const inflight = new Map();
export const runOnce = async (key, task, state = inflight) => {
  const existing = state.get(key);
  if (existing) return existing.promise;
  const result = deferred();
  state.set(key, { promise: result.promise, startedAt: Date.now() });
  void Promise.resolve().then(task).then(result.resolve, result.reject).finally(() => {
    if (state.get(key)?.promise === result.promise) state.delete(key);
  });
  return result.promise;
};

const idempotency = new Map();
export const idempotent = async (key, task, state = idempotency) => {
  const existing = state.get(key);
  if (existing) return { value: await existing, replayed: true };
  const execution = Promise.resolve().then(task);
  state.set(key, execution);
  try {
    return { value: await execution, replayed: false };
  } catch (error) {
    if (state.get(key) === execution) state.delete(key);
    throw error;
  }
};

export const simulatedRates = { inputMicroUsdPer1K: 10_000, outputMicroUsdPer1K: 30_000 };
export const costInMicroUsd = (inputTokens, outputTokens, rates = simulatedRates) => {
  if (!Number.isInteger(inputTokens) || inputTokens < 0) throw new Error("inputTokens must be a non-negative integer");
  if (!Number.isInteger(outputTokens) || outputTokens < 0) throw new Error("outputTokens must be a non-negative integer");
  return Math.ceil((inputTokens * rates.inputMicroUsdPer1K + outputTokens * rates.outputMicroUsdPer1K) / 1_000);
};
export const formatUsd = (microUsd) => `$${(microUsd / 1_000_000).toFixed(6)}`;
export class CostLedger {
  totalMicroUsd = 0;
  constructor(rates = simulatedRates, maxMicroUsd) {
    this.rates = rates;
    this.maxMicroUsd = maxMicroUsd;
  }
  charge(tool, inputTokens, outputTokens) {
    const microUsd = costInMicroUsd(inputTokens, outputTokens, this.rates);
    if (this.maxMicroUsd !== undefined && this.totalMicroUsd + microUsd > this.maxMicroUsd) throw new Error(`budget exceeded before ${tool}`);
    this.totalMicroUsd += microUsd;
    return { tool, inputTokens, outputTokens, microUsd };
  }
  get total() { return this.totalMicroUsd; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = async () => {
    console.log("=== 并发去重：10 个请求同时打同一个 key ===");
    let stockExecutions = 0;
    const stock = await Promise.all(Array.from({ length: 10 }, () => runOnce("get_stock", async () => {
      stockExecutions++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return "stock:100";
    })));
    console.log(`  ${stock.length} 个请求拿到 ${new Set(stock).size} 个结果，task 实际执行 ${stockExecutions} 次（期望 1）`);
    const ledger = new CostLedger();
    let orderExecutions = 0;
    const placeOrder = async () => { orderExecutions++; ledger.charge("create_order", 500, 200); return "order:A-100"; };
    await Promise.all(Array.from({ length: 10 }, () => idempotent("order:100", placeOrder)));
    await idempotent("order:100", placeOrder);
    console.log(`  幂等副作用执行 ${orderExecutions} 次`);
    for (const [tool, input, output] of [["get_stock", 300, 150], ["get_stock", 300, 150], ["create_order", 500, 200]]) {
      const charge = ledger.charge(tool, input, output);
      console.log(`  计费：${tool} in=${input} out=${output} => ${formatUsd(charge.microUsd)}`);
    }
    console.log(`  总计 ${formatUsd(ledger.total)}`);
  };
  void run();
}
