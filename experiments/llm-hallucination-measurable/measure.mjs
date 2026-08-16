/**
 * 幻觉可测量性实验:评测幻觉的前提是"答案可判定"。
 *
 * 设计:
 *  1. 合成"可判定题库":每道题有 ground truth(派生自确定性函数,可判定对错)
 *  2. 模拟模型:真实幻觉率 r 未知,在 n 道题上作答,统计评测出的幻觉率
 *  3. 核心问题:评测估计的误差取决于 n(样本量)而不是 r 本身;
 *     以及"不可判定题"会怎样污染估计
 *
 * 结论仅限模拟,不代表真实模型。
 */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function makeQuestions(n, unverifiableRatio, seed) {
  const rand = makeRandom(seed);
  const qs = [];
  for (let i = 0; i < n; i++) {
    const base = Math.floor(i * 7.31) % 1000; // 确定性 ground truth
    qs.push({
      id: i,
      truth: base,
      verifiable: rand() > unverifiableRatio, // 可判定与否
    });
  }
  return qs;
}

// 模拟模型:幻觉率 r 时,verifiable 题答错概率=r;不可判定题乱猜(错率 50%)
function simulateModel(questions, r, seed) {
  const rand = makeRandom(seed);
  let verifiableWrong = 0;
  let verifiableTotal = 0;
  let allWrong = 0;
  for (const q of questions) {
    const wrong = q.verifiable ? rand() < r : rand() < 0.5;
    if (wrong) allWrong++;
    if (q.verifiable) {
      verifiableTotal++;
      if (wrong) verifiableWrong++;
    }
  }
  return { verifiableWrong, verifiableTotal, allWrong, total: questions.length };
}

function run() {
  console.log("== 实验 1:真实幻觉率 r 固定,评测样本量 n 决定误差 ==");
  console.log("r=0.15,每个 n 重复 100 次,报告评测幻觉率的散布");
  for (const n of [10, 30, 100, 300, 1000]) {
    const ests = [];
    for (let rep = 0; rep < 100; rep++) {
      const qs = makeQuestions(n, 0.05, 1000 + rep);
      const res = simulateModel(qs, 0.15, 42 + rep);
      // 正确评测:只统计可判定题(不可判定题单独报告,不计入幻觉率)
      ests.push(res.verifiableWrong / res.verifiableTotal);
    }
    const mean = ests.reduce((a, b) => a + b, 0) / ests.length;
    const sd = Math.sqrt(ests.reduce((a, b) => a + (b - mean) ** 2, 0) / ests.length);
    console.log(`n=${String(n).padStart(5)} 评测幻觉率均值=${mean.toFixed(3)} ± ${sd.toFixed(3)}`);
  }

  console.log("\n== 实验 2:不可判定题污染估计 ==");
  console.log("r=0.1 固定,不可判定题占比 u 从 0 到 0.6,评测会把不可判定题的随机错误也算成幻觉");
  for (const u of [0, 0.1, 0.3, 0.6]) {
    const ests = [];
    for (let rep = 0; rep < 100; rep++) {
      const qs = makeQuestions(200, u, 2000 + rep);
      const res = simulateModel(qs, 0.1, 7 + rep);
      // 朴素评测:所有错都算幻觉
      ests.push(res.allWrong / res.total);
    }
    const mean = ests.reduce((a, b) => a + b, 0) / ests.length;
    console.log(`u=${u.toFixed(1)}  朴素评测幻觉率≈${mean.toFixed(3)} (真实 r=0.10,污染=${((mean - 0.10) * 100).toFixed(0)}pp)`);
  }

  console.log("\n== 实验 3:幻觉不是均匀分布的——分栏统计才有信号 ==");
  // 模拟:闭卷事实错 40%、引用不存在来源 20%、推理错 10%、计算错 30%
  const types = [
    { name: "闭卷事实", r: 0.40 },
    { name: "虚构引用", r: 0.20 },
    { name: "推理错误", r: 0.10 },
    { name: "计算错误", r: 0.30 },
  ];
  for (const t of types) {
    const qs = makeQuestions(200, 0.05, 5000);
    const res = simulateModel(qs, t.r, 99);
    console.log(`${t.name.padEnd(6)} 真实误率=${t.r.toFixed(2)} 评测误率=${(res.verifiableWrong / res.verifiableTotal).toFixed(2)}`);
  }
}

run();
