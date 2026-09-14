// 错误形状喂模型：粗码自愈 0/5，富错误 5/5。
// stub 模型确定性行为：无 hint 重试同错，有 hint 切只读副本成功。运行：node heal.mjs
function stubModel(task, lastError) {
  // 富错误带可执行 hint → 自愈；粗码 → 原样重错。
  if (lastError && lastError.hint === "use-read-replica") {
    return { ok: true, via: "replica" };
  }
  return { ok: false, error: "E_CONN" };
}

function run(attempts, errorShape) {
  let err = null;
  for (let i = 0; i < attempts; i++) {
    const r = stubModel({}, err);
    if (r.ok) return { healed: true, rounds: i + 1, via: r.via };
    err = errorShape; // 下一轮喂给模型的错误形状
  }
  return { healed: false, rounds: attempts };
}

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// H1：粗码（只有 code）5 轮 0 自愈。
let coarseWins = 0;
for (let t = 0; t < 5; t++) {
  if (run(3, { code: "E_CONN" }).healed) coarseWins++;
}
check("H1 粗码自愈率 0/5", coarseWins === 0, `${coarseWins}/5`);

// H2：富错误（code + retryable + hint）5 轮全自愈，且 2 轮内。
let richWins = 0;
let maxRounds = 0;
for (let t = 0; t < 5; t++) {
  const r = run(3, { code: "E_CONN", retryable: true, hint: "use-read-replica" });
  if (r.healed) {
    richWins++;
    maxRounds = Math.max(maxRounds, r.rounds);
  }
}
check("H2 富错误自愈率 5/5", richWins === 5 && maxRounds <= 2, `${richWins}/5, 最多 ${maxRounds} 轮`);

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
