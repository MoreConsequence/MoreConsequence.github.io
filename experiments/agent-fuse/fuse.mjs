// Agent 死循环熔断：同一失败签名连 3 次即开闸，交替错误不误伤。
// 只用内置。运行：node fuse.mjs
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

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// F1：同一签名连错 3 次，第 3 步熔断（不是第 6 步跑完）。
const r1 = runLoop(() => "ERR_TIMEOUT", 6, 3);
check("F1 同签名连错3次即熔断", r1.outcome === "fused" && r1.steps === 3, JSON.stringify(r1));

// F2：交替错误跑满 6 步不熔断（误伤对照）。
const alt = ["E1", "E2"];
const r2 = runLoop((s) => alt[s % 2], 6, 3);
check("F2 交替错误不误伤", r2.outcome === "exhausted" && r2.steps === 6, JSON.stringify(r2));

// F3：第 2 步自愈即成功，历史清零语义（成功直接返回）。
const r3 = runLoop((s) => (s < 2 ? "E1" : null), 6, 3);
check("F3 自愈即成功", r3.outcome === "success" && r3.steps === 3, JSON.stringify(r3));

// F4：熔断信息带签名，可直接定位。
check("F4 熔断带签名", r1.signature === "ERR_TIMEOUT");
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
