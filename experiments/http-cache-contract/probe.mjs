import http from "node:http";

const body = Buffer.from("console.log('v1');\n");
const etag = '"v1"';

const server = http.createServer((request, response) => {
  if (request.url !== "/asset.js") {
    response.writeHead(404).end();
    return;
  }

  response.setHeader("Cache-Control", "public, max-age=60");
  response.setHeader("ETag", etag);
  response.setHeader("Content-Type", "application/javascript");

  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304).end();
    return;
  }

  response.writeHead(200, { "Content-Length": body.length });
  response.end(body);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

async function probe(name, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/asset.js`, { headers });
  const bytes = new Uint8Array(await response.arrayBuffer()).byteLength;
  console.log(
    `case=${name} status=${response.status} body_bytes=${bytes} etag=${response.headers.get("etag")} cache_control=${response.headers.get("cache-control")}`,
  );
}

console.log(`node=${process.version}`);
await probe("initial");
await probe("matching-etag", { "If-None-Match": etag });
server.close();
