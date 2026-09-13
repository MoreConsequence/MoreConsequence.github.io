// 最小原型：MCP Tasks 扩展形状——长任务用 taskId + 轮询，不占连接。
// 教学形状（tasks/get + tasks/update + input_required 首轮），非逐字段 spec 实现。
// 只用 Node 内置 http。运行：node demo.mjs（Node >= 18）
import http from "node:http";

const PROTOCOL = "2026-07-28";
let failures = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
  if (!cond) failures++;
}
function start(handler, store) {
  const srv = http.createServer(handler);
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv)));
}
function post(port, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", ...headers } },
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
const H = { "mcp-protocol-version": PROTOCOL, "mcp-method": "tools/call", "mcp-name": "migrate-db" };

// 任务存储是显式的、可插拔的：不共享存储的实例看不见彼此的任务
function taskInstance(name, store) {
  let seq = 0;
  return async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const msg = JSON.parse(body || "{}");
    const send = (obj, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const method = req.headers["mcp-method"];
    if (method === "tasks/get") {
      const t = store.get(msg.params?.taskId);
      if (!t) return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "unknown task" } }, 404);
      return send({ jsonrpc: "2.0", id: msg.id, result: { taskId: t.id, status: t.status, progress: t.progress, owner: t.owner } });
    }
    if (method === "tasks/update") {
      const t = store.get(msg.params?.taskId);
      if (!t) return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "unknown task" } }, 404);
      t.progress = msg.params.progress;
      if (msg.params.status) t.status = msg.params.status;
      return send({ jsonrpc: "2.0", id: msg.id, result: { taskId: t.id, status: t.status, progress: t.progress } });
    }
    if (method === "tools/call") {
      // 首轮：缺参数 → input_required；带答案 → 创建长任务，立即返回 taskId，不阻塞
      if (!msg.params?.inputResponses?.confirm) {
        return send({ jsonrpc: "2.0", id: msg.id, result: { resultType: "input_required", needs: [{ key: "confirm" }] } });
      }
      const id = `task-${name}-${++seq}`;
      store.set(id, { id, status: "running", progress: 0, owner: name });
      return send({ jsonrpc: "2.0", id: msg.id, result: { taskId: id, status: "running", owner: name } });
    }
    return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "unknown method" } }, 400);
  };
}

const shared = new Map(); // C、D 共用：模拟共享任务存储
const solo = new Map(); // E 独享：模拟无共享存储的实例
const srvC = await start(taskInstance("C", shared));
const srvD = await start(taskInstance("D", shared));
const srvE = await start(taskInstance("E", solo));
const P = (s) => s.address().port;

// T1: 首轮 input_required，带答案重试即创建任务并立即返回（连接不保持）
const first = await post(P(srvC), "/mcp", H, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "migrate-db" } });
const created = await post(P(srvC), "/mcp", H, {
  jsonrpc: "2.0", id: 2, method: "tools/call",
  params: { name: "migrate-db", inputResponses: { confirm: "yes" } },
});
const taskId = created.body.result?.taskId;
check("T1 长任务立即返回 taskId", first.body.result?.resultType === "input_required" && typeof taskId === "string", `taskId=${taskId}`);

// T2: 进度更新 + 换实例轮询——共享存储下，D 能看到 C 创建的任务
await post(P(srvC), "/mcp", { ...H, "mcp-method": "tasks/update" }, {
  jsonrpc: "2.0", id: 3, method: "tasks/update", params: { taskId, progress: 0.5 },
});
const polled = await post(P(srvD), "/mcp", { ...H, "mcp-method": "tasks/get" }, {
  jsonrpc: "2.0", id: 4, method: "tasks/get", params: { taskId },
});
check("T2 共享存储下跨实例轮询", polled.body.result?.progress === 0.5 && polled.body.result?.owner === "C", JSON.stringify(polled.body.result));

// T3: 完成任务，终端状态可读
await post(P(srvD), "/mcp", { ...H, "mcp-method": "tasks/update" }, {
  jsonrpc: "2.0", id: 5, method: "tasks/update", params: { taskId, progress: 1, status: "done" },
});
const done = await post(P(srvC), "/mcp", { ...H, "mcp-method": "tasks/get" }, {
  jsonrpc: "2.0", id: 6, method: "tasks/get", params: { taskId },
});
check("T3 终端状态可读", done.body.result?.status === "done" && done.body.result?.progress === 1);

// T4: 无共享存储的实例看不见别人的任务——Tasks 不变魔术，状态仍需你存
const blind = await post(P(srvE), "/mcp", { ...H, "mcp-method": "tasks/get" }, {
  jsonrpc: "2.0", id: 7, method: "tasks/get", params: { taskId },
});
check("T4 无共享存储即未知任务", blind.status === 404 && /unknown task/.test(blind.body.error.message));

// T5: tools/call 仍是无状态的——E 可独立创建自己的任务（对照：任务状态与传输无状态正交）
const own = await post(P(srvE), "/mcp", H, {
  jsonrpc: "2.0", id: 8, method: "tools/call",
  params: { name: "migrate-db", inputResponses: { confirm: "yes" } },
});
check("T5 传输无状态不受任务存储影响", own.body.result?.owner === "E" && typeof own.body.result?.taskId === "string");

for (const s of [srvC, srvD, srvE]) s.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
