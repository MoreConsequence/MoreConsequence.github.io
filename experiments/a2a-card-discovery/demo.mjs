// 最小原型：A2A 风格的 Agent Card 发现与任务路由（教学形状，非逐字段 spec 实现）。
// 只用 Node 内置 http，无外部依赖。运行：node demo.mjs（Node >= 18）
import http from "node:http";

let failures = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
  if (!cond) failures++;
}
function start(handler) {
  const srv = http.createServer(handler);
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv)));
}
function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }).on("error", reject);
  });
}
function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json" } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

// 一个“对等 agent”：well-known 卡 + 任务入口，只接自己声明的 skill
function peerAgent(card, onTask) {
  return async (req, res) => {
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
        return send({ error: { code: -32602, message: `skill not offered: ${task.skill}` } }, 400);
      }
      return send({ handledBy: card.name, result: onTask(task) });
    }
    return send({ error: "not found" }, 404);
  };
}

const coder = await start(peerAgent(
  { name: "coder", version: "1.4.0", skills: ["codegen"], endpoint: "/tasks" },
  (t) => `patch for ${t.input}`,
));
const searcher = await start(peerAgent(
  { name: "searcher", version: "2.0.0", skills: ["websearch"], endpoint: "/tasks" },
  (t) => `hits for ${t.input}`,
));
const ports = { coder: coder.address().port, searcher: searcher.address().port };

// 客户端：只知道 base 地址，其余全部从卡上学
async function discover(port) {
  const r = await get(port, "/.well-known/agent-card.json");
  if (r.status !== 200) throw new Error("no card");
  return { port, ...r.body };
}
function sameMajor(a, b) {
  return a.split(".")[0] === b.split(".")[0];
}

const cards = [await discover(ports.coder), await discover(ports.searcher)];

// D1: 发现——两个对等体的能力全部来自卡，客户端零预配置
check(
  "D1 卡即全部配置",
  cards.find((c) => c.name === "coder").skills.includes("codegen") &&
    cards.find((c) => c.name === "searcher").skills.includes("websearch"),
  cards.map((c) => `${c.name}@${c.version}[${c.skills}]`).join(" "),
);

// D2: 路由——codegen 任务落到 coder，且只发一次请求
const target = cards.find((c) => c.skills.includes("codegen"));
const done = await post(target.port, "/tasks", { skill: "codegen", input: "fix retry bug" });
check("D2 按卡路由一次命中", done.body.handledBy === "coder" && done.body.result === "patch for fix retry bug");

// D3: 未声明的 skill 在本地就被拒绝，零网络浪费
const missing = cards.filter((c) => c.skills.includes("videorender"));
check("D3 未知 skill 零请求拒绝", missing.length === 0, "no peer offers videorender, no request sent");

// D4: 发错 skill 到对等体，对方按卡拒绝（防御性校验仍在服务端）
const wrong = await post(ports.searcher, "/tasks", { skill: "codegen", input: "x" });
check("D4 服务端按卡校验", wrong.status === 400 && /not offered/.test(wrong.body.error.message));

// D5: 主版本不一致即标脏——要求 coder ^2.0.0 时 1.4.0 不可接
const wanted = "2.0.0";
const coderCard = cards.find((c) => c.name === "coder");
check("D5 主版本不兼容被拦截", !sameMajor(coderCard.version, wanted), `coder@${coderCard.version} vs wanted ^${wanted}`);

for (const s of [coder, searcher]) s.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
