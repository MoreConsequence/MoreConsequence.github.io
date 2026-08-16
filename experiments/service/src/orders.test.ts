import { describe, it, expect } from "vitest";
import { OrderSchema } from "./orders.ts";

// 第 1 层：单元测试——业务 schema 契约
describe("OrderSchema 契约", () => {
  it("接受合法订单", () => {
    const r = OrderSchema.safeParse({
      orderId: "A-1", sku: "sku-1", customerId: 7, qty: 2,
      status: "PAID", createdAt: "2026-08-16T00:00:00Z",
    });
    expect(r.success).toBe(true);
  });
  it("拒绝非法 qty", () => {
    const r = OrderSchema.safeParse({
      orderId: "A-1", sku: "sku-1", customerId: 7, qty: 0,
      status: "PAID", createdAt: "2026-08-16T00:00:00Z",
    });
    expect(r.success).toBe(false);
  });
  it("拒绝未知 status", () => {
    const r = OrderSchema.safeParse({
      orderId: "A-1", sku: "sku-1", customerId: 7, qty: 2,
      status: "REFUNDED", createdAt: "2026-08-16T00:00:00Z",
    });
    expect(r.success).toBe(false);
  });
});
