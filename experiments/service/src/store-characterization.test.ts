import { describe, it, expect } from "vitest";
import { BoundedInMemoryStore, UnboundedInMemoryStore } from "./store.ts";
import type { Order } from "./orders.ts";

// Characterization suite：冻结 BoundedInMemoryStore 当前可观测行为（包括可疑怪癖），
// 作为重构安全网。断言写的是"现在是什么样"，不是"应该是什么样"；
// 任何一条想改，先作为显式行为变更过评审，不许在重构里顺手"修好"。
const order = (id: string): Order => ({
  orderId: id,
  sku: "sku-1",
  customerId: 7,
  qty: 2,
  status: "CREATED",
  createdAt: "2026-08-23T00:00:00Z",
});

describe("characterization: BoundedInMemoryStore 行为快照", () => {
  it("容量上限是精确等式：150 笔进 cap=100，恰好剩 100", async () => {
    const store = new BoundedInMemoryStore(100);
    for (let i = 0; i < 150; i++) {
      await store.saveByKey(`k-${i}`, order(`A-${i}`), `fp-${i}`);
    }
    expect(store.size).toBe(100);
    expect(store.keySize).toBe(100);
  });

  it("驱逐按插入顺序 FIFO：最老的订单和它的幂等键一起消失", async () => {
    const store = new BoundedInMemoryStore(2);
    await store.saveByKey("k-A", order("A"));
    await store.saveByKey("k-B", order("B"));
    await store.saveByKey("k-C", order("C")); // 触发驱逐 A
    expect(await store.get("A")).toBeUndefined();
    expect(await store.get("B")).toBeDefined();
    // 双表联动：订单被驱逐后，幂等键也不许残留
    expect(await store.findByKey("k-A")).toBeUndefined();
    expect(store.size).toBe(store.keySize);
  });

  it("get 不续命：读操作不改变驱逐顺序（不是 LRU）", async () => {
    const store = new BoundedInMemoryStore(2);
    await store.saveByKey("k-A", order("A"));
    await store.saveByKey("k-B", order("B"));
    await store.get("A"); // 刚读过 A
    await store.saveByKey("k-C", order("C"));
    expect(await store.get("A")).toBeUndefined(); // A 仍被驱逐
    expect(await store.get("B")).toBeDefined();
  });

  it("重复 save 同 key：权威结果保持原对象，且不改变其驱逐位次", async () => {
    const store = new BoundedInMemoryStore(2);
    const first = order("A");
    await store.saveByKey("k-A", first);
    await store.saveByKey("k-B", order("B"));
    const replay = await store.saveByKey("k-A", order("A-dup"), "same-fp");
    expect(replay.created).toBe(false);
    expect(await store.findByKey("k-A")).toBe(first); // 同一引用，不是 dup
    expect(await store.get("A-dup")).toBeUndefined();
    await store.saveByKey("k-C", order("C")); // 驱逐的仍是最初的 A 位次
    expect(await store.get("A")).toBeUndefined();
  });

  it("指纹怪癖：首次无指纹时，后续不同指纹不算冲突", async () => {
    const store = new BoundedInMemoryStore(10);
    await store.saveByKey("k-1", order("A")); // 未带指纹
    const second = await store.saveByKey("k-1", order("B"), "fp-x");
    expect(second.created).toBe(false);
    expect(second.conflict).toBe(false); // 当前语义：缺一边就不比
    expect((await store.findByKey("k-1"))?.orderId).toBe("A"); // 权威结果仍是首次的 A
  });

  it("构造参数校验：0、负数、非整数、NaN 都拒绝", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => new BoundedInMemoryStore(bad)).toThrow();
    }
  });

  it("create 路径计入容量；无键订单被驱逐时不触碰幂等表（当前真实行为）", async () => {
    const store = new BoundedInMemoryStore(2);
    await store.create(order("A")); // 无幂等键
    await store.saveByKey("k-B", order("B"));
    await store.create(order("C")); // 驱逐最老的 A
    expect(await store.get("A")).toBeUndefined();
    expect(store.size).toBe(2); // B、C 留存
    expect(store.keySize).toBe(1); // 只有 B 有键：无键订单不参与双表联动
  });
});

describe("characterization: UnboundedInMemoryStore 基线", () => {
  it("只进不出：500 笔后 size 与 keySize 都是 500", async () => {
    const store = new UnboundedInMemoryStore();
    for (let i = 0; i < 500; i++) {
      await store.saveByKey(`k-${i}`, order(`A-${i}`), `fp-${i}`);
    }
    expect(store.size).toBe(500);
    expect(store.keySize).toBe(500);
  });

  it("同 key 不同指纹的冲突判定与有界版一致", async () => {
    const store = new UnboundedInMemoryStore();
    await store.saveByKey("k-1", order("A"), "fp-1");
    const second = await store.saveByKey("k-1", order("B"), "fp-2");
    expect(second.conflict).toBe(true);
    expect(store.size).toBe(1);
  });
});
