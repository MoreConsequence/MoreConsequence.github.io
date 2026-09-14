// webhook 签名与重放：HMAC 对上才执行，同 event id 复投不重执。
// 只用内置 http + crypto。运行：node hook.mjs
import http from "node:http";
import crypto from "node:crypto";

const SECRET = "s3cr3t";
const seen = new Set();
let executions = 0;
const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("hex");

const srv = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  let body = "";
  for await (const c of req) body += c;
  const sig = req.headers["x-signature"];
  const expect = sign(body);
  if (typeof sig !== "string" || sig.length !== expect.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    return send(401, { error: "bad signature" });
  }
  const { id } = JSON.parse(body);
  if (seen.has(id)) return send(200, { duplicate: true });
  seen.add(id);
  executions++;
  return send(200, { ok: true });
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;

const deliver = (payload, secret = SECRET, tamper = false) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const req = http.request(
      {
        host: "127.0.0.1", port, path: "/hook", method: "POST",
        headers: { "content-type": "application/json", "x-signature": sig },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      },
    );
    req.on("error", reject);
    req.end(tamper ? body.replace("100", "999") : body); // 签名对原文，重放篡改体
  });

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

const r1 = await deliver({ id: "evt-1", amount: 100 });
check("H1 合法投递执行", r1.status === 200 && r1.body.ok === true && executions === 1);

const r2 = await deliver({ id: "evt-1", amount: 100 });
check("H2 同 id 复投不重执", r2.status === 200 && r2.body.duplicate === true && executions === 1, `executions=${executions}`);

const r3 = await deliver({ id: "evt-2", amount: 100 }, SECRET, true);
check("H3 篡改体签名失效", r3.status === 401, `status=${r3.status}`);

const r4 = await deliver({ id: "evt-3", amount: 100 }, "wrong-secret");
check("H4 错密钥拒绝", r4.status === 401, `status=${r4.status}`);

srv.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
