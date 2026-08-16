import { createServer } from "node:http";
const routes = Array.from({ length: 200 }, (_, i) => `/api/resource${i}/${i % 10}`);
const server = createServer((req, res) => {
  const hit = routes.find((r) => r === req.url);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ hit: hit ?? "none" }));
});
server.listen(4103, () => console.log("bomb on 4103"));
