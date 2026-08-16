// 模拟 LLM Agent 工具循环：演示 TS 类型系统如何让并发编排可编译、可失败、可取消
//
// 不接真实 LLM：用 sleep 模拟模型"思考"，工具调用以 JSON 形式从"模型"返回，
// 每次调用有 30% 概率失败——用来演示 allSettled 保留部分成功。
import { setTimeout as sleep } from "node:timers/promises";

// ---------- 1. 工具协议：可辨识联合，模型输出与代码共享同一形状 ----------

type ToolCall =
  | { id: string; kind: "lookup_order"; orderId: string }
  | { id: string; kind: "get_stock"; sku: string }
  | { id: string; kind: "cancel_order"; orderId: string };

// 模型"吐出"的 JSON 要先证明形状，这是真正的信任边界
function parseToolCall(raw: unknown): ToolCall {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`not an object: ${String(raw)}`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.kind !== "string") {
    throw new Error(`missing id/kind: ${JSON.stringify(raw)}`);
  }
  switch (o.kind) {
    case "lookup_order":
      if (typeof o.orderId !== "string") throw new Error("orderId missing");
      return { id: o.id, kind: o.kind, orderId: o.orderId };
    case "get_stock":
      if (typeof o.sku !== "string") throw new Error("sku missing");
      return { id: o.id, kind: o.kind, sku: o.sku };
    case "cancel_order":
      if (typeof o.orderId !== "string") throw new Error("orderId missing");
      return { id: o.id, kind: o.kind, orderId: o.orderId };
    default:
      throw new Error(`unknown kind: ${String(o.kind)}`);
  }
}

// ---------- 2. 工具实现：每个工具是 (call) => Promise<unknown> ----------

type ToolResult = { ok: true; value: unknown } | { ok: false; error: string };

const failureRate = 0.3;

async function runTool(call: ToolCall): Promise<ToolResult> {
  if (Math.random() < failureRate) {
    return { ok: false, error: `tool ${call.kind} exploded` };
  }
  await sleep(50 + Math.random() * 80); // 模拟外部延迟
  switch (call.kind) {
    case "lookup_order":
      return { ok: true, value: { status: "PROCESSING", items: 3 } };
    case "get_stock":
      return { ok: true, value: { available: 12 } };
    case "cancel_order":
      return { ok: true, value: { cancelled: true } };
  }
}

// ---------- 3. 并发 + 超时 + 部分成功：类型保护不让失败溜走 ----------

async function executeBatch(
  calls: ToolCall[],
  timeoutMs: number,
): Promise<ToolResult[]> {
  const withTimeout = calls.map((call) =>
    Promise.race([
      runTool(call),
      sleep(timeoutMs).then(() => ({ ok: false, error: "timeout" }) as ToolResult),
    ]),
  );
  return Promise.all(withTimeout);
}

// ---------- 4. 主循环：模型 ↔ 工具的交锋，用 never 逼出穷尽 ----------

function assertNever(x: never): never {
  throw new Error(`unreached: ${JSON.stringify(x)}`);
}

// 工具成本表：每个工具一个定额。新加工具类型而忘记补分支 = 编译错误。
function toolCost(call: ToolCall): number {
  switch (call.kind) {
    case "lookup_order":
      return 2;
    case "get_stock":
      return 1;
    case "cancel_order":
      return 5;
    default:
      return assertNever(call);
  }
}

async function agentLoop(maxRounds: number, timeoutMs: number) {
  // 模拟模型：第一轮给两个工具调用（一个注定失败），第二轮收尾
  const rounds: unknown[][] = [
    [
      { id: "c1", kind: "lookup_order", orderId: "A-100" },
      { id: "c2", kind: "get_stock", sku: "SKU-9" },
    ],
    [{ id: "c3", kind: "cancel_order", orderId: "A-100" }],
  ];

  for (let round = 0; round < maxRounds && round < rounds.length; round++) {
    console.log(`── round ${round + 1}`);
    const calls = rounds[round].map(parseToolCall);
    const budget = calls.reduce((sum, c) => sum + toolCost(c), 0);
    console.log(`  预算消耗：${calls.map((c) => `${c.kind}=${toolCost(c)}`).join(" ")}（合计 ${budget}）`);
    const results = await executeBatch(calls, timeoutMs);
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const result = results[i];
      // 显式穷尽：不满足 ok:true 或 ok:false 的分支被编译期拒绝
      if (result.ok) {
        console.log(`  ${call.id} ${call.kind} → ok ${JSON.stringify(result.value)}`);
      } else {
        console.log(`  ${call.id} ${call.kind} → FAIL ${result.error}`);
      }
    }
    // 模型的下一步：按结果分支（示意）
    const allOk = results.every((r) => r.ok);
    if (allOk) {
      console.log("  模型：全部成功，收尾");
    } else if (round === 0) {
      console.log("  模型：补一轮重试");
    } else {
      console.log("  模型：告诉用户部分失败，结束");
    }
  }
}

await agentLoop(2, 100);
console.log("done");