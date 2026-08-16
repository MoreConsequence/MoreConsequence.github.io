import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "./app.ts";
import { BoundedInMemoryStore } from "./store.ts";
import { Metrics } from "./metrics.ts";
import type { Order } from "./orders.ts";

// 第 3 层：集成测试——真实路由 + 替身存储,不启动端口
const seed: Order = { orderId: "A-100", sku: "sku-1", customerId: 7, qty: 2, status: "PAID", createdAt: "2026-08-16T00:00:00Z" };

const post = async (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request("/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("订单 API 集成", () => {
  let app: ReturnType<typeof createApp>;
  let store: BoundedInMemoryStore;
  let metrics: Metrics;
  beforeEach(async () => {
    store = new BoundedInMemoryStore();
    await store.saveByKey("seed-key-1", seed);
    metrics = new Metrics();
    app = createApp(store, metrics);
  });

  it("GET 已存在订单 → 200 + 形状", async () => {
    const res = await app.request("/orders/A-100");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderId).toBe("A-100");
    expect(body).not.toHaveProperty("error");
  });

  it("GET 不存在 → 404 + 契约错误形状", async () => {
    const res = await app.request("/orders/ghost");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("POST 非法 body → 400 + details 数组", async () => {
    const res = await post(app, { sku: "", customerId: -1, qty: 500, idempotencyKey: "req-00000001" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_BODY");
    expect(body.error.details.length).toBe(3);
    expect(body.error.details[0].path).toEqual(["sku"]);
  });

  it("POST 同幂等键两次 → 同一订单(第二次命中已建,不新建)", async () => {
    const body = { sku: "sku-9", customerId: 7, qty: 3, idempotencyKey: "req-dup-0001" };
    const r1 = await post(app, body);
    const r2 = await post(app, body);
    expect(r1.status).toBe(201);  // 首次创建
    expect(r2.status).toBe(200);  // 幂等命中:不新建,返回已有
    expect((await r1.json()).orderId).toBe((await r2.json()).orderId);
  });

  it("POST 同幂等键并发 100 次 → 只创建一次,其余重放权威结果", async () => {
    const body = { sku: "sku-concurrent", customerId: 7, qty: 1, idempotencyKey: "req-concurrent-01" };
    const responses = await Promise.all(Array.from({ length: 100 }, () => post(app, body)));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(99);
    const orderIds = new Set(await Promise.all(responses.map(async (response) => (await response.json()).orderId)));
    expect(orderIds.size).toBe(1);
    expect(store.size).toBe(2); // seed + the one canonical order
  });

  it("POST 同幂等键不同 body → 409,不静默复用订单", async () => {
    const first = { sku: "sku-first", customerId: 7, qty: 1, idempotencyKey: "req-conflict-01" };
    await expect((await post(app, first)).status).toBe(201);
    const second = await post(app, { ...first, sku: "sku-second" });
    expect(second.status).toBe(409);
    expect((await second.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(store.size).toBe(2);
  });

  it("POST 合法 → 201 + CREATED 状态", async () => {
    const res = await post(app, { sku: "sku-9", customerId: 7, qty: 3, idempotencyKey: "req-new-0001" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("CREATED");
  });

  it("四条退出路径都留下按操作/结果分组的延迟样本", async () => {
    await app.request("/orders/A-100");
    await app.request("/orders/ghost");
    await post(app, { sku: "", customerId: -1, qty: 500, idempotencyKey: "req-invalid-01" });

    const metricsAfterRoutes = metrics.snapshot();
    expect(metricsAfterRoutes.latencies.orders_get?.ok?.n).toBe(1);
    expect(metricsAfterRoutes.latencies.orders_get?.not_found?.n).toBe(1);
    expect(metricsAfterRoutes.latencies.orders_create?.validation_failed?.n).toBe(1);
  });

  it("store 抛错 → 500,仍记录 error 延迟且不泄漏内部消息", async () => {
    const failingStore = {
      get: async () => { throw new Error("database password should not be returned"); },
      create: async () => undefined,
      findByKey: async () => undefined,
      saveByKey: async () => { throw new Error("unexpected"); },
    };
    const failingMetrics = new Metrics();
    const failingApp = createApp(failingStore, failingMetrics);
    const response = await failingApp.request("/orders/A-100");
    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe("internal server error");
    expect(failingMetrics.snapshot().latencies.orders_get?.error?.n).toBe(1);
  });
});
