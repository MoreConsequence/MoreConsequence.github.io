import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const orderSchema = z.object({
  sku: z.string(),
  customerId: z.number().int().positive(),
  qty: z.number().int().min(1).max(99),
});

const app = new Hono();
app.post("/orders", zValidator("json", orderSchema), (c) => {
  const body = c.req.valid("json");
  return c.json({ orderId: `${body.sku}-${body.qty}`, customer: body.customerId });
});
serve({ fetch: app.fetch, port: 4105 }, () => console.log("validate on 4105"));
