import { discriminatedUnion, object, string, literal } from "zod/v4";

export const schema = discriminatedUnion("kind", [
  object({ id: string(), kind: literal("lookup_order"), orderId: string() }),
  object({ id: string(), kind: literal("get_stock"), sku: string() }),
  object({ id: string(), kind: literal("cancel_order"), orderId: string() }),
]);

export function zod_v4_parse(raw) {
  return schema.parse(raw);
}