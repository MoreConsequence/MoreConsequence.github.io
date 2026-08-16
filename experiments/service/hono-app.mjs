import { Hono } from "hono";
import { serve } from "@hono/node-server";
const app = new Hono();
app.get("/hello", (c) => c.json({ message: "Hello", ts: Date.now() }));
app.post("/orders", async (c) => {
  const body = await c.req.json();
  return c.json({ orderId: body?.sku || "none", customer: (body?.customerId ?? 0) * 1 });
});
serve({ fetch: app.fetch, port: 4102 }, () => console.log("hono on 4102"));
