// async generator cleanup：for-await break 会调 return()，手动 next() 弃置不会。
// 运行：node demo.mjs
let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

function makeGen(tag, flags) {
  return (async function* () {
    try {
      let i = 0;
      while (true) yield `${tag}-${i++}`;
    } finally {
      flags[tag] = true; // 清理标记：return()/throw() 或生成器 GC 时跑
    }
  })();
}

// A：for-await + break → 规范要求调 return()
const flagsA = {};
{
  const gen = makeGen("A", flagsA);
  for await (const v of gen) {
    if (v === "A-2") break;
  }
}
check("A1 for-await break 触发 cleanup", flagsA.A === true, `flags=${JSON.stringify(flagsA)}`);

// B：手动 next() 两次后直接丢弃引用 → 不调 return()，cleanup 不跑
const flagsB = {};
{
  let gen = makeGen("B", flagsB);
  await gen.next();
  await gen.next();
  gen = null; // 弃置：V8 可能稍后 GC 才跑 finally，且时机不确定
  await new Promise((r) => setTimeout(r, 50));
}
check("B1 弃置迭代器 cleanup 未运行", flagsB.B !== true, `flags=${JSON.stringify(flagsB)}`);

// C：手动 next() 但显式 return() → cleanup 跑（正确写法）
const flagsC = {};
{
  const gen = makeGen("C", flagsC);
  await gen.next();
  await gen.return();
}
check("C1 显式 return() 触发 cleanup", flagsC.C === true, `flags=${JSON.stringify(flagsC)}`);

// D：for-await 抛异常退出 → throw() 进生成器，finally 照跑
const flagsD = {};
{
  const gen = makeGen("D", flagsD);
  try {
    for await (const v of gen) {
      if (v === "D-1") throw new Error("boom");
    }
  } catch { /* swallow */ }
}
check("D1 异常退出触发 cleanup", flagsD.D === true, `flags=${JSON.stringify(flagsD)}`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
