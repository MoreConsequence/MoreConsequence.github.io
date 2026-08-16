import { z } from "zod";
export const ToolCallSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("lookup_order"), orderId: z.string() }),
  z.object({ id: z.string(), kind: z.literal("get_stock"), sku: z.string() }),
  z.object({ id: z.string(), kind: z.literal("cancel_order"), orderId: z.string() }),
]);
