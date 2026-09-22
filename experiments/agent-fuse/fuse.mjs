// Agent 死循环熔断：同签名连错 3 次开闸，交替错误与震荡循环检测。
// 运行：node experiments/agent-fuse/fuse.mjs

function runLoop(tool, maxSteps, fuseThreshold) {
  const history = [];
  for (let step = 0; step < maxSteps; step++) {
    const err = tool(step);
    if (!err) return { outcome: "success", steps: step + 1 };
    history.push(err);
    const tail = history.slice(-fuseThreshold);
    if (tail.length === fuseThreshold && tail.every((s) => s === err)) {
      return { outcome: "fused", steps: step + 1, signature: err };
    }
  }
  return { outcome: "exhausted", steps: maxSteps };
}

// 工业级扩展：包含签名归一化与双周期交替震荡检测 (A -> B -> A -> B)
function normalizeSignature(toolName, errString) {
  // 抹平动态时间戳、PID、文件行号与 UUID
  const sanitized = errString
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/g, "<TIME>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>")
    .replace(/line \d+/gi, "line <NUM>")
    .replace(/pid \d+/gi, "pid <PID>");
  return `${toolName}:${sanitized}`;
}

function runAdvancedLoop(tool, maxSteps, fuseThreshold = 3, periodThreshold = 2) {
  const history = [];
  for (let step = 0; step < maxSteps; step++) {
    const err = tool(step);
    if (!err) return { outcome: "success", steps: step + 1 };
    history.push(err);

    // 1. 同签名连续重试检测
    const tail = history.slice(-fuseThreshold);
    if (tail.length === fuseThreshold && tail.every((s) => s === err)) {
      return { outcome: "fused_consecutive", steps: step + 1, signature: err };
    }

    // 2. 双步交替震荡死循环检测 (A -> B -> A -> B)
    if (history.length >= periodThreshold * 2) {
      const pTail = history.slice(-periodThreshold * 2);
      const isOscillating = pTail[0] === pTail[2] && pTail[1] === pTail[3] && pTail[0] !== pTail[1];
      if (isOscillating) {
        return { outcome: "fused_oscillation", steps: step + 1, pattern: [pTail[0], pTail[1]] };
      }
    }
  }
  return { outcome: "exhausted", steps: maxSteps };
}

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// F1：同一签名连错 3 次，第 3 步熔断（不是第 6 步跑完）。
const r1 = runLoop(() => "ERR_TIMEOUT", 6, 3);
check("F1 同签名连错3次即熔断", r1.outcome === "fused" && r1.steps === 3, JSON.stringify(r1));

// F2：交替错误跑满 6 步不熔断（普通连续窗口误伤对照）。
const alt = ["E1", "E2"];
const r2 = runLoop((s) => alt[s % 2], 6, 3);
check("F2 交替错误不误伤连续窗口", r2.outcome === "exhausted" && r2.steps === 6, JSON.stringify(r2));

// F3：第 2 步自愈即成功，历史清零语义（成功直接返回）。
const r3 = runLoop((s) => (s < 2 ? "E1" : null), 6, 3);
check("F3 自愈即成功", r3.outcome === "success" && r3.steps === 3, JSON.stringify(r3));

// F4：熔断信息带签名，可直接定位。
check("F4 熔断带签名", r1.signature === "ERR_TIMEOUT");

// F5：高级检测：长序列交替震荡循环 (A -> B -> A -> B) 在第 4 步精准熔断
const r5 = runAdvancedLoop((s) => alt[s % 2], 10, 3, 2);
check("F5 交替震荡循环在第 4 步精准熔断", r5.outcome === "fused_oscillation" && r5.steps === 4, JSON.stringify(r5));

// F6：签名归一化：动态时间戳与行号抹平为稳定签名
const sig1 = normalizeSignature("bash", "Error at line 42: pid 1928 timeout at 2026-09-19T01:23:45.000Z");
const sig2 = normalizeSignature("bash", "Error at line 99: pid 2048 timeout at 2026-09-19T01:23:49.123Z");
check("F6 动态报错字符串成功归一化为恒定签名", sig1 === sig2 && sig1 === "bash:Error at line <NUM>: pid <PID> timeout at <TIME>");

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
