// A2A 委派链：coder 按卡把 review 子任务委派给 reviewer，再组装返回。
// 只用内置 http。运行：node chain.mjs
import http from "node:http";

function start(card, onTask) {
  const srv = http.createServer(async (req, res) => {
    const send = (obj, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "GET" && req.url === "/.well-known/agent-card.json") return send(card);
    if (req.method === "POST" && req.url === "/tasks") {
      let body = "";
      for await (const c of req) body += c;
      const task = JSON.parse(body || "{}");
      if (!card.skills.includes(task.skill)) {
        return send({ error: `skill not offered: ${task.skill}` }, 400);
      }
      return send(await onTask(task));
    }
    return send({ error: "not found" }, 404);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}
const call = (port, skill, input, base) =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify({ skill, input });
    const req = http.request(
      { host: "127.0.0.1", port, path: "/tasks", method: "POST", headers: { "content-type": "application/json" } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw), base }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
const discover = (port) =>
  new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: "/.well-known/agent-card.json" }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({ port, ...JSON.parse(raw) }));
    }).on("error", reject);
  });

// reviewer：只懂 review，且记录收到的输入（证明委派边界）。
let reviewerSeen = null;
const reviewer = await start({ name: "reviewer", version: "1.0.0", skills: ["review"] }, async (t) => {
  reviewerSeen = t.input;
  return { handledBy: "reviewer", verdict: `LGTM:${t.input}` };
});
const rPort = reviewer.address().port;

// coder：codegen 自己做，review 按卡委派，再组装。
const coder = await start({ name: "coder", version: "2.1.0", skills: ["codegen"] }, async (t) => {
  const patch = `patch:${t.input}`;
  const peers = [await discover(rPort)];
  const rev = peers.find((p) => p.skills.includes("review"));
  if (!rev) return { handledBy: "coder", error: "no reviewer" };
  const r = await call(rev.port, "review", patch);
  return { handledBy: "coder", patch, review: r.body.verdict };
});
const cPort = coder.address().port;

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// D1：整链完成，coder 组装 patch + review。
const done = await call(cPort, "codegen", "fix-retry");
check(
  "D1 委派链完成",
  done.body.patch === "patch:fix-retry" && done.body.review === "LGTM:patch:fix-retry",
  JSON.stringify(done.body),
);

// D2：reviewer 只看到子任务输入，看不到原始任务（委派边界）。
check("D2 子任务输入隔离", reviewerSeen === "patch:fix-retry", `seen=${reviewerSeen}`);

// D3：向 coder 直调 review 被拒（能力边界仍在）。
const bad = await call(cPort, "review", "x");
check("D3 越权直调被拒", bad.status === 400, JSON.stringify(bad.body));

for (const s of [reviewer, coder]) s.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
