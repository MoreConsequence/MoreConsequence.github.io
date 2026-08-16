import { describe, it, expect, beforeEach } from "vitest";
import { BoundedInMemoryStore } from "./store.ts";
import type { Order } from "./orders.ts";

const order: Order = { orderId: "A-1", sku: "sku-1", customerId: 7, qty: 2, status: "CREATED", createdAt: "2026-08-16T00:00:00Z" };

// 第 2 层：仓储单元测试——内存实现的行为
describe("BoundedInMemoryStore", () => {
  let store: BoundedInMemoryStore;
  beforeEach(() => { store = new BoundedInMemoryStore(); });

  it("get 未命中返回 undefined", async () => {
    expect(await store.get("ghost")).toBeUndefined();
  });
  it("create 后可 get", async () => {
    await store.create(order);
    expect(await store.get("A-1")).toEqual(order);
  });
  it("saveByKey 后按 key 可查 + 幂等", async () => {
    await store.saveByKey("key-1", order);
    expect(await store.findByKey("key-1")).toEqual(order);
    const dup = { ...order, orderId: "A-2" };
    const result = await store.saveByKey("key-1", dup); // 同 key 不覆盖权威结果
    expect(await store.findByKey("key-1")).toEqual(order); // 期望保持原值
    expect(result).toMatchObject({ created: false, conflict: false, order });
  });

  it("同 key 不同请求指纹 → 冲突,不写入第二个订单", async () => {
    await store.saveByKey("key-1", order, "fingerprint-a");
    const result = await store.saveByKey("key-1", { ...order, orderId: "A-2" }, "fingerprint-b");
    expect(result).toMatchObject({ created: false, conflict: true, order });
    expect(store.size).toBe(1);
    expect(store.keySize).toBe(1);
  });

  it("500 次插入后两张表都不超过容量上限", async () => {
    const bounded = new BoundedInMemoryStore(100);
    for (let i = 0; i < 500; i++) {
      await bounded.saveByKey(`key-${i}`, { ...order, orderId: `A-${i}` }, `fingerprint-${i}`);
    }
    expect(bounded.size).toBeLessThanOrEqual(100);
    expect(bounded.keySize).toBeLessThanOrEqual(100);
  });

  it("并发 claim 同一个 key → 只有一个调用创建", async () => {
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) =>
      store.saveByKey("same-key", { ...order, orderId: `A-${i}` }, "same-payload")
    ));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.order.orderId)).size).toBe(1);
  });
});
