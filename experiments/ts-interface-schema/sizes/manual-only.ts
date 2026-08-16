type ToolCall =
  | { id: string; kind: "lookup_order"; orderId: string }
  | { id: string; kind: "get_stock"; sku: string }
  | { id: string; kind: "cancel_order"; orderId: string };
export function parseToolCall(raw: unknown): ToolCall {
  if (typeof raw !== "object" || raw === null) throw new Error("not an object");
  const o = raw as Record<string, unknown>;
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
