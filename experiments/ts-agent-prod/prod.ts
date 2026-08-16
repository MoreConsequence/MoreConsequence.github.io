// Agent 服务化的三个局部原型：请求合并、单进程幂等、整数成本账。
// 它们都明确限制在一个进程内；多实例/重启后的权威状态仍需数据库或队列。
import { pathToFileURL } from "node:url";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

type InflightEntry = { promise: Promise<unknown>; startedAt: number };
export type InflightMap = Map<string, InflightEntry>;
const inflight: InflightMap = new Map();

export const runOnce = async <T>(
  key: string,
  task: () => Promise<T>,
  state: InflightMap = inflight,
): Promise<T> => {
  const existing = state.get(key);
  if (existing) return existing.promise as Promise<T>;

  // 先放入占位 Promise，再启动 task。这样 task 的同步前缀即使重入，
  // 也只能看到同一个 Promise，而不是在第一个 await 前打开竞争窗口。
  const result = deferred<T>();
  state.set(key, { promise: result.promise, startedAt: Date.now() });
  void Promise.resolve()
    .then(task)
    .then(result.resolve, result.reject)
    .finally(() => {
      if (state.get(key)?.promise === result.promise) state.delete(key);
    });
  return result.promise;
};

export type IdempotentResult<T> = { value: T; replayed: boolean };
export type IdempotencyMap = Map<string, Promise<unknown>>;

const idempotency: IdempotencyMap = new Map();
export const idempotent = async <T>(
  key: string,
  task: () => Promise<T>,
  state: IdempotencyMap = idempotency,
): Promise<IdempotentResult<T>> => {
  const existing = state.get(key) as Promise<T> | undefined;
  if (existing) return { value: await existing, replayed: true };

  // 同 key 的执行 Promise 在 task 启动前入表，合并并发调用；失败时删除，
  // 允许调用方按显式重试策略再次尝试，而不是永久吞掉失败。
  const execution = Promise.resolve().then(task);
  state.set(key, execution);
  try {
    return { value: await execution, replayed: false };
  } catch (error) {
    if (state.get(key) === execution) state.delete(key);
    throw error;
  }
};

export type TokenRates = {
  inputMicroUsdPer1K: number;
  outputMicroUsdPer1K: number;
};

// 纯模拟费率：输入 $0.01/1k，输出 $0.03/1k。不是任何厂商的当前报价。
export const simulatedRates: TokenRates = {
  inputMicroUsdPer1K: 10_000,
  outputMicroUsdPer1K: 30_000,
};

export const costInMicroUsd = (
  inputTokens: number,
  outputTokens: number,
  rates: TokenRates = simulatedRates,
) => {
  if (!Number.isInteger(inputTokens) || inputTokens < 0) throw new Error("inputTokens must be a non-negative integer");
  if (!Number.isInteger(outputTokens) || outputTokens < 0) throw new Error("outputTokens must be a non-negative integer");
  return Math.ceil(
    (inputTokens * rates.inputMicroUsdPer1K + outputTokens * rates.outputMicroUsdPer1K) / 1_000,
  );
};

export const formatUsd = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(6)}`;

export class CostLedger {
  private totalMicroUsd = 0;
  private readonly rates: TokenRates;
  private readonly maxMicroUsd?: number;

  constructor(rates: TokenRates = simulatedRates, maxMicroUsd?: number) {
    this.rates = rates;
    this.maxMicroUsd = maxMicroUsd;
  }

  charge(tool: string, inputTokens: number, outputTokens: number) {
    const microUsd = costInMicroUsd(inputTokens, outputTokens, this.rates);
    if (this.maxMicroUsd !== undefined && this.totalMicroUsd + microUsd > this.maxMicroUsd) {
      throw new Error(`budget exceeded before ${tool}`);
    }
    this.totalMicroUsd += microUsd;
    return { tool, inputTokens, outputTokens, microUsd };
  }

  get total() { return this.totalMicroUsd; }
}

export const run = async () => {
  console.log("=== 并发去重：10 个请求同时打同一个 key ===");
  let stockExecutions = 0;
  const stock = await Promise.all(Array.from({ length: 10 }, () => runOnce("get_stock", async () => {
    stockExecutions++;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return "stock:100";
  })));
  console.log(`  ${stock.length} 个请求拿到 ${new Set(stock).size} 个结果，task 实际执行 ${stockExecutions} 次（期望 1）`);

  console.log("=== 幂等：同 key 并发 + 顺序重试 ===");
  const ledger = new CostLedger();
  let orderExecutions = 0;
  const placeOrder = async () => {
    orderExecutions++;
    ledger.charge("create_order", 500, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "order:A-100";
  };
  const concurrentOrders = await Promise.all(Array.from({ length: 10 }, () => idempotent("order:100", placeOrder)));
  const replay = await idempotent("order:100", placeOrder);
  console.log(`  ${concurrentOrders.length + 1} 次调用，副作用执行 ${orderExecutions} 次，重放 ${concurrentOrders.filter((item) => item.replayed).length + Number(replay.replayed)} 次`);

  console.log("=== 成本核算：每 1k token 计费，而不是每 token ===");
  for (const [tool, input, output] of [["get_stock", 300, 150], ["get_stock", 300, 150], ["create_order", 500, 200]] as const) {
    const charge = ledger.charge(tool, input, output);
    console.log(`  计费：${tool} in=${input} out=${output} => ${formatUsd(charge.microUsd)}`);
  }
  console.log(`  总计 ${formatUsd(ledger.total)}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void run();
}
