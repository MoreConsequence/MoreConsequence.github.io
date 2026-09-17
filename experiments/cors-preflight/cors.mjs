// CORS 预检三件套：方法、头、凭据；通配符 + 凭据是陷阱。
// 只用内置 http。运行：node cors.mjs
import http from "node:http";

const ALLOWED = new Set(["https://app.example"]);

const srv = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const ok = ALLOWED.has(origin);
  if (req.method === "OPTIONS") {
    // 预检：只回允许的源/方法/头，顺手缓存 600s。
    res.writeHead(ok ? 204 : 403, {
      ...(ok ? { "access-control-allow-origin": origin } : {}),
      "access-control-allow-methods": "GET, POST",
      "access-control-allow-headers": "content-type, x-token",
      "access-control-max-age": "600",
      vary: "Origin",
    });
    res.end();
    return;
  }
  res.writeHead(200, {
    ...(ok ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  res.end(JSON.stringify({ ok }));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;

const req = (method, headers) =>
  new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port, path: "/api", method, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode, h: res.headers }));
    });
    q.on("error", reject);
    q.end();
  });

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// C1：合法源预检 204，三件套齐全。
const pre = await req("OPTIONS", {
  origin: "https://app.example",
  "access-control-request-method": "POST",
  "access-control-request-headers": "x-token",
});
check(
  "C1 合法预检 204",
  pre.status === 204 &&
    pre.h["access-control-allow-origin"] === "https://app.example" &&
    pre.h["access-control-allow-methods"] === "GET, POST" &&
    pre.h["access-control-max-age"] === "600",
  `status=${pre.status}`,
);

// C2：非法源预检 403 且无 allow-origin（浏览器直接拦）。
const bad = await req("OPTIONS", { origin: "https://evil.example", "access-control-request-method": "POST" });
check("C2 非法源无凭据头", bad.status === 403 && !bad.h["access-control-allow-origin"], `status=${bad.status}`);

// C3：凭据请求回显具体源而非 *（通配符+凭据是陷阱：浏览器拒收）。
const cred = await req("GET", { origin: "https://app.example" });
check(
  "C3 凭据回显具体源",
  cred.h["access-control-allow-origin"] === "https://app.example" &&
    cred.h["access-control-allow-credentials"] === "true",
  `origin=${cred.h["access-control-allow-origin"]}`,
);

// C4：非法源实际请求无 allow-origin（即使凭据头在，浏览器也不交数据）。
const badGet = await req("GET", { origin: "https://evil.example" });
check("C4 非法源实际请求被拦", !badGet.h["access-control-allow-origin"]);

// C5（加固）：Vary: Origin 必带——否则 CDN 把 A 源的 allow-origin 缓存喂给 B 源。
const vary = await req("GET", { origin: "https://app.example" });
check("C5 Vary 防缓存投毒", (vary.h.vary || "").includes("Origin"), `vary=${vary.h.vary}`);

srv.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
