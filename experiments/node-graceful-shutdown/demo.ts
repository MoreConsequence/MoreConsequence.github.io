import http from "node:http";

const controller = new AbortController();
const { signal } = controller;

let inFlight = 0;
let drainRejects = 0;

const server = http.createServer(async (req, res) => {
  if (signal.aborted) {
    res.writeHead(503, { "Retry-After": "0" });
    res.end("shutting down");
    drainRejects++;
    return;
  }

  inFlight++;
  await new Promise((r) => setTimeout(r, 200));
  res.end("ok");
  inFlight--;
});

server.listen(3000, () => {
  console.log("server listening on :3000");

  // Simulate 10 concurrent requests
  const results: string[] = [];
  for (let i = 0; i < 10; i++) {
    fetch("http://localhost:3000/")
      .then((r) => r.text())
      .then((t) => results.push(t))
      .catch(() => results.push("rejected"));
  }

  // SIGTERM at t=50ms
  setTimeout(() => {
    console.log("SIGTERM → DRAINING");
    server.close(() => {
      console.log(`done. inFlight=${inFlight}, drainRejects=${drainRejects}`);
      console.log(`results: ${results.join(", ")}`);
      process.exit(0);
    });
    setTimeout(() => {
      console.log("force exit");
      process.exit(1);
    }, 3000);
  }, 50);
});
