import Fastify from "fastify";
const app = Fastify({ logger: false });
app.get("/hello", async () => ({ message: "Hello", ts: Date.now() }));
app.post("/orders", async (req) => {
  const body = req.body;
  return { orderId: body?.sku || "none", customer: (body?.customerId ?? 0) * 1 };
});
app.listen({ port: 4101 }, () => console.log("fastify on 4101"));
