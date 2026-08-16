import Fastify from "fastify";
const app = Fastify();
const schema = {
  body: {
    type: "object",
    required: ["sku", "customerId", "qty"],
    properties: {
      sku: { type: "string" },
      customerId: { type: "integer", minimum: 1 },
      qty: { type: "integer", minimum: 1, maximum: 99 },
    },
  },
};
app.post("/orders", { schema }, async (req) => {
  const { sku, customerId, qty } = req.body;
  return { orderId: `${sku}-${qty}`, customer: customerId };
});
app.listen({ port: 4106 }, () => console.log("validate-fastify on 4106"));
