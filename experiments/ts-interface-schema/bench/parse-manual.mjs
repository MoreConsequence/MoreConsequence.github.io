// 与 sizes/manual-only.ts 同构的手写守卫，仅转成 .mjs 供 benchmark 直接调用。
export function manual_parse(raw) {
  if (typeof raw !== "object" || raw === null) throw new Error("not an object");
  const o = raw;
  if (typeof o.id !== "string" || typeof o.kind !== "string") throw new Error("missing");
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
      throw new Error("unknown kind");
  }
}