import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ERROR_CODES, toApiError } from "./orders.js";
import { BoundedInMemoryStore } from "./store.js";
import { Metrics } from "./metrics.js";
const operationFor = (method, path) => {
    if (method === "GET" && path.startsWith("/orders/"))
        return "orders_get";
    if (method === "POST" && path === "/orders")
        return "orders_create";
    return `${method.toLowerCase()}_${path.replaceAll("/", "_").replaceAll(/[^a-zA-Z0-9_]/g, "") || "root"}`;
};
const outcomeFor = (status) => {
    if (status >= 200 && status < 400)
        return "ok";
    if (status === 404)
        return "not_found";
    if (status === 400)
        return "validation_failed";
    if (status === 409)
        return "conflict";
    if (status >= 500)
        return "error";
    return "other";
};
export const createApp = (store, metrics = new Metrics()) => {
    const app = new Hono();
    app.use("*", async (c, next) => {
        const t0 = performance.now();
        try {
            await next();
        }
        finally {
            // finally 覆盖 handler 的 return、validator 的 400 和异常路径。
            metrics.observe(operationFor(c.req.method, c.req.path), performance.now() - t0, outcomeFor(c.res.status));
        }
    });
    app.get("/healthz", (c) => {
        // liveness 只回答“进程还能处理请求”，不把依赖健康伪装成 true。
        return c.json({ ok: true, ts: Date.now() });
    });
    app.get("/readyz", async (c) => {
        const ready = await store.ready?.() ?? true;
        if (!ready) {
            c.status(503);
            return c.json({ ok: false });
        }
        return c.json({ ok: true });
    });
    app.get("/metrics", (c) => c.json(metrics.snapshot()));
    app.get("/orders/:id", async (c) => {
        const order = await store.get(c.req.param("id"));
        if (!order) {
            metrics.inc("orders_get_not_found");
            c.status(404);
            return c.json(toApiError(ERROR_CODES.ORDER_NOT_FOUND, `order ${c.req.param("id")} not found`));
        }
        metrics.inc("orders_get_ok");
        return c.json(order);
    });
    const createOrderBody = z.object({
        sku: z.string().min(1),
        customerId: z.number().int().positive(),
        qty: z.number().int().min(1).max(99),
        idempotencyKey: z.string().min(8).max(64),
    });
    const zodHook = async (result, c) => {
        if (result.success)
            return undefined;
        metrics.inc("orders_create_validation_failed");
        c.status(400);
        return c.json(toApiError("INVALID_BODY", "request body failed validation", result.error.issues.map((i) => ({ path: i.path.map(String), code: i.code, message: i.message }))));
    };
    app.post("/orders", zValidator("json", createOrderBody, zodHook), async (c) => {
        const v = c.req.valid("json");
        const order = {
            orderId: `A-${randomUUID()}`,
            sku: v.sku,
            customerId: v.customerId,
            qty: v.qty,
            status: "CREATED",
            createdAt: new Date().toISOString(),
        };
        const result = await store.saveByKey(v.idempotencyKey, order, JSON.stringify({ sku: v.sku, customerId: v.customerId, qty: v.qty }));
        if (result.conflict) {
            metrics.inc("orders_create_idempotency_conflict");
            c.status(409);
            return c.json(toApiError(ERROR_CODES.IDEMPOTENCY_CONFLICT, "idempotency key was already used with a different request"));
        }
        if (!result.created) {
            metrics.inc("orders_create_idempotent_hit");
            return c.json(result.order);
        }
        metrics.inc("orders_create_ok");
        c.status(201);
        return c.json(result.order);
    });
    app.onError((err, c) => {
        metrics.inc("orders_internal_errors");
        c.status(500);
        console.error(err);
        return c.json(toApiError("INTERNAL", "internal server error"));
    });
    return app;
};
if (import.meta.url === `file://${process.argv[1]}`) {
    serve({ fetch: createApp(new BoundedInMemoryStore()).fetch, port: 4110 }, () => console.log("order service on 4110"));
}
//# sourceMappingURL=app.js.map