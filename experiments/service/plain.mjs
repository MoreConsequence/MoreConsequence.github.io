import { createServer } from "node:http";
const server = createServer((req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.url === "/hello") {
    res.end(JSON.stringify({ message: "Hello", ts: Date.now() }));
    return;
  }
  if (req.method === "POST" && req.url === "/orders") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        res.end(JSON.stringify({ orderId: parsed.sku || "none", customer: (parsed.customerId ?? 0) * 1 }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "bad json" }));
      }
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});
server.listen(4100, () => console.log("plain on 4100"));
