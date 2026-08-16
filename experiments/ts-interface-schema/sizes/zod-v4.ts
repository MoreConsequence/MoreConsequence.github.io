import { discriminatedUnion, object, string, literal } from "zod/v4";
import type * as z from "zod/v4";
export const ToolCallSchema = discriminatedUnion("kind", [
  object({ id: string(), kind: literal("lookup_order"), orderId: string() }),
  object({ id: string(), kind: literal("get_stock"), sku: string() }),
  object({ id: string(), kind: literal("cancel_order"), orderId: string() }),
]);
export type ToolCall = z.infer<typeof ToolCallSchema>;
