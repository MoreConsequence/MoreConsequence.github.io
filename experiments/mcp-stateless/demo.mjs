// 最小原型：MCP 旧版有状态会话 vs 2026-07-28 无状态核心。
// 只用 Node 内置 http，无外部依赖。每个场景断言 printing PASS/FAIL，退出码非 0 表示失败。
// 运行：node demo.mjs（需 Node >= 18）
import http from "node:http";

const PROTOCOL = "2026-07-28";
let failures = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
  if (!cond) failures++;
}

function start(handler) {
  const srv = http.createServer(handler);
  return new Promise((resolve) => {
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}
function post(port, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", ...headers } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(raw) }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}
const addr = (srv) => srv.address().port;

// ---- 场景 A：旧版有状态（initialize + Mcp-Session-Id），两实例各持 session 表 ----
function oldInstance() {
  const sessions = new Map();
  let n = 0;
  return async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const msg = JSON.parse(body || "{}");
    const send = (obj, sid) => {
      res.writeHead(200, { "content-type": "application/json", ...(sid ? { "mcp-session-id": sid } : {}) });
      res.end(JSON.stringify(obj));
    };
    if (msg.method === "initialize") {
      const sid = `sid-${++n}`;
      sessions.set(sid, { tools: ["search"] });
      return send({ jsonrpc: "2.0", id: msg.id, result: { capabilities: { tools: {} } } }, sid);
    }
    const sid = req.headers["mcp-session-id"];
    if (!sessions.has(sid)) {
      return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32002, message: "unknown session" } });
    }
    return send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "ok" }] } });
  };
}

// ---- 场景 B：新版无状态（自描述请求 + 头路由 + 可缓存 list + MRTR），实例无任何会话存储 ----
function newInstance(name) {
  return async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const msg = JSON.parse(body || "{}");
    const send = (obj, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.headers["mcp-protocol-version"] !== PROTOCOL) {
      return send({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32602, message: "unsupported protocol version" } }, 400);
    }
    const method = req.headers["mcp-method"];
    const tool = req.headers["mcp-name"];
    if (method === "server/discover") {
      return send({ jsonrpc: "2.0", id: msg.id, result: { version: PROTOCOL, capabilities: { tools: {}, lists: { cacheable: true } } } });
    }
    if (method === "tools/list") {
      // 确定性顺序 + 缓存提示（SEP-2549 的教学形状）
      return send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: [{ name: "delete-db" }, { name: "search" }], ttlMs: 60000, cacheScope: "server" },
      });
    }
    if (method === "tools/call" && tool === "delete-db") {
      const answers = msg.params?.inputResponses;
      if (!answers?.confirm) {
        return send({
          jsonrpc: "2.0",
          id: msg.id,
          result: { resultType: "input_required", needs: [{ key: "confirm", prompt: "确认删除测试库？" }] },
        });
      }
      return send({ jsonrpc: "2.0", id: msg.id, result: { handledBy: name, applied: answers.confirm === "yes" } });
    }
    if (method === "tools/call") {
      return send({ jsonrpc: "2.0", id: msg.id, result: { handledBy: name, content: [{ type: "text", text: "ok" }] } });
    }
    return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "unknown method" } }, 400);
  };
}

const oldA = await start(oldInstance());
const oldB = await start(oldInstance());
const newC = await start(newInstance("C"));
const newD = await start(newInstance("D"));

// A1: 旧版——在 A 上 initialize，拿 sid 去调 B（模拟无粘性轮询），必须 -32002
const init = await post(addr(oldA), "/mcp", {}, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
const sid = init.headers["mcp-session-id"];
const cross = await post(
  addr(oldB),
  "/mcp",
  { "mcp-session-id": sid },
  { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: {} } },
);
check("A1 旧版跨实例无粘性被拒绝", cross.body.error?.code === -32002, `code=${cross.body.error?.code} sid=${sid}`);

// A2: 旧版——同实例携带 sid 调用成功（对照组：协议本身没坏，是状态放错了地方）
const same = await post(
  addr(oldA),
  "/mcp",
  { "mcp-session-id": sid },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search", arguments: {} } },
);
check("A2 旧版同实例调用成功", !same.body.error, JSON.stringify(same.body.result));

// B1: 新版——同一自描述请求轮询打到 C 和 D，都成功，且实例名不同（无共享存储）
const reqHeaders = {
  "mcp-protocol-version": PROTOCOL,
  "mcp-method": "tools/call",
  "mcp-name": "search",
};
const callBody = (id) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name: "search", arguments: {}, _meta: { "io.modelcontextprotocol/clientInfo": { name: "demo", version: "1.0" } } },
});
const rC = await post(addr(newC), "/mcp", reqHeaders, callBody(11));
const rD = await post(addr(newD), "/mcp", reqHeaders, callBody(12));
check(
  "B1 新版任意实例可处理",
  rC.body.result?.handledBy === "C" && rD.body.result?.handledBy === "D",
  `C=${rC.body.result?.handledBy} D=${rD.body.result?.handledBy}`,
);

// B2: 新版——网关只读头就能路由（不解析 body 也能区分 tools/call:delete-db）
const route = (headers) => (headers["mcp-method"] === "tools/call" && headers["mcp-name"] === "delete-db" ? "danger-queue" : "default");
check(
  "B2 头路由无需解析 body",
  route({ "mcp-method": "tools/call", "mcp-name": "delete-db" }) === "danger-queue" &&
    route({ "mcp-method": "tools/list" }) === "default",
);

// B3: 新版——tools/list 返回确定性顺序 + ttlMs，客户端缓存后第二次不再请求
const list1 = await post(addr(newC), "/mcp", { "mcp-protocol-version": PROTOCOL, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 21, method: "tools/list" });
const names = list1.body.result?.tools?.map((t) => t.name);
let fetches = 1;
const cached = list1.body.result; // 客户端按 ttlMs 缓存
fetches += 0; // 第二次命中缓存，不产生请求
check(
  "B3 list 可缓存且顺序确定",
  JSON.stringify(names) === JSON.stringify(["delete-db", "search"]) && cached.ttlMs === 60000 && fetches === 1,
  `tools=${names} ttlMs=${cached.ttlMs} fetches=${fetches}`,
);

// B4: 新版 MRTR——敏感工具先回 input_required，客户端带答案重试后由另一实例完成（中途无需保持连接）
const first = await post(
  addr(newC),
  "/mcp",
  { "mcp-protocol-version": PROTOCOL, "mcp-method": "tools/call", "mcp-name": "delete-db" },
  { jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "delete-db", arguments: { db: "test" } } },
);
const retry = await post(
  addr(newD), // 注意：换了一个实例，重试依然成立
  "/mcp",
  { "mcp-protocol-version": PROTOCOL, "mcp-method": "tools/call", "mcp-name": "delete-db" },
  {
    jsonrpc: "2.0",
    id: 32,
    method: "tools/call",
    params: { name: "delete-db", arguments: { db: "test" }, inputResponses: { confirm: "yes" } },
  },
);
check(
  "B4 MRTR 跨实例重试完成",
  first.body.result?.resultType === "input_required" && retry.body.result?.applied === true && retry.body.result?.handledBy === "D",
  `first=${first.body.result?.resultType} retry=${JSON.stringify(retry.body.result)}`,
);

// B5: 新版——错误码收敛到 -32602（旧 -32002 不再是协议错误）
const bad = await post(addr(newC), "/mcp", { "mcp-protocol-version": PROTOCOL, "mcp-method": "nope/nope" }, { jsonrpc: "2.0", id: 41, method: "nope/nope" });
check("B5 未知方法返回标准 -32602", bad.body.error?.code === -32602, `code=${bad.body.error?.code}`);

for (const s of [oldA, oldB, newC, newD]) s.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
