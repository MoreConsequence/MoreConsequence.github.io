// zod 与手写守卫对照：同一 ToolCall 协议，两种实现
// 度量：代码行数、错误定位精度、类型推导、体积
import { z } from "zod";
import * as fs from "node:fs";

// ---------- 手写守卫（02 篇的原版 parseToolCall） ----------
type ToolCall =
  | { id: string; kind: "lookup_order"; orderId: string }
  | { id: string; kind: "get_stock"; sku: string }
  | { id: string; kind: "cancel_order"; orderId: string };

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

// ---------- zod 版 ----------
const ToolCallSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("lookup_order"), orderId: z.string() }),
  z.object({ id: z.string(), kind: z.literal("get_stock"), sku: z.string() }),
  z.object({ id: z.string(), kind: z.literal("cancel_order"), orderId: z.string() }),
]);
// 类型从 schema 推导，不再手写第二份
type ToolCallZ = z.infer<typeof ToolCallSchema>;

// ---------- 坏输入对照：错误定位精度 ----------
const badInputs = [
  { id: "c1", kind: "lookup_order" }, // 缺 orderId
  { id: "c1", kind: "refund", orderId: "A-1" }, // 未知 kind
  { id: 42, kind: "get_stock", sku: "SKU-9" }, // id 类型错
];

console.log("=== 错误定位精度 ===");
for (const bad of badInputs) {
  try {
    parseToolCall(bad);
    console.log("手写: 未抛错?");
  } catch (e) {
    console.log(`手写: ${(e as Error).message}`);
  }
  const r = ToolCallSchema.safeParse(bad);
  if (!r.success) {
    console.log(`zod : ${JSON.stringify(r.error.issues.map((i) => ({ path: i.path.join("."), msg: i.message })))}`);
  }
}

// ---------- 代码行数与体积 ----------
const manual = fs.readFileSync(new URL(import.meta.url), "utf-8");
console.log("\n=== 体积 ===");
console.log(`zod package manifest 大小（不是 bundle）: ${fs.statSync("node_modules/zod/package.json").size}B`);

// ---------- 类型推导验证（编译期） ----------
const good: unknown = { id: "c9", kind: "get_stock", sku: "SKU-1" };
const parsed = ToolCallSchema.parse(good);
if (parsed.kind === "get_stock") {
  console.log(`\n=== 类型推导 ===\nparsed.sku 可访问（判别收窄）: ${parsed.sku}`);
}
