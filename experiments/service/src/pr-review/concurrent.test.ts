import { describe, it, expect } from "vitest";
import { RacyIdempotencyStore } from "./before-store.ts";
import { BoundedInMemoryStore } from "../store.ts";
import type { Order } from "../orders.ts";

// 评审反例：两个相同请求"同时到达"。PR_REVIEW_RED=1 时以普通断言运行，
// 复现 PR 的真实失败；默认用 it.fails 把这个失败固定成可执行评审意见。
const RED = process.env.PR_REVIEW_RED === "1";
const order = (i: number): Order => ({
  orderId: `A-${i}`,
  sku: "sku-1",
  customerId: 7,
  qty: 2,
  status: "CREATED",
  createdAt: "2026-08-23T00:00:00Z",
});

const concurrentSameKey = async (store: RacyIdempotencyStore | BoundedInMemoryStore) => {
  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      store.saveByKey("same-key", order(i), "same-payload"),
    ),
  );
  return {
    createdCount: results.filter((r) => r.created).length,
    distinctOrders: new Set(results.map((r) => r.order.orderId)).size,
    storedSize: store.size,
  };
};

describe("幂等 PR 并发评审", () => {
  // 对被评审的实现：顺序用例全绿，并发用例必须红。
  (RED ? it : it.fails)(
    "RacyIdempotencyStore：100 个同 key 并发请求只允许创建 1 个订单",
    async () => {
      const stats = await concurrentSameKey(new RacyIdempotencyStore());
      expect(stats.createdCount).toBe(1);
      expect(stats.distinctOrders).toBe(1);
      expect(stats.storedSize).toBe(1);
    },
  );

  // 对合并后的实现：同一把尺子，必须绿。
  it("BoundedInMemoryStore：同一测试通过（claim 是单个同步动作）", async () => {
    const stats = await concurrentSameKey(new BoundedInMemoryStore());
    expect(stats.createdCount).toBe(1);
    expect(stats.distinctOrders).toBe(1);
    expect(stats.storedSize).toBe(1);
  });
});
