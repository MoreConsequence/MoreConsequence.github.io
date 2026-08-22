#!/usr/bin/env node
// 评测集泄漏模拟：训练语料与评测集的重叠比例如何虚高"模型能力"。
// 世界是合成的、种子固定的：每个题目的真实难度相同，唯一变量是"模型是否见过"。
import { writeFileSync } from "node:fs";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20260823);
const N_EVAL = 500;          // 评测集大小
const P_BASE = 0.5;         // 真实能力：没见过的题目答对概率
const P_MEMORIZE = 0.95;    // 见过近重复题后的答对概率（记忆，不是推理）
const NGRAM = 3;            // 泄漏检测用的 n-gram 长度

const q = (i) => `如何配置服务-${i} 的重试策略与超时参数`;
const grams = (s) => {
  const w = s.split(" ");
  return new Set(w.slice(0, -1).flatMap((_, i) => [w.slice(i, i + NGRAM).join(" ")]));
};

const answer = (seen) => rand() < (seen ? P_MEMORIZE : P_BASE);

let table = "";
console.log(`seed 固定 · N_EVAL=${N_EVAL} · P_base=${P_BASE} · P_memorize=${P_MEMORIZE}`);
console.log("");
console.log("| 训练语料含近重复题的比例 | 评测准确率 | 相对真实能力的虚高 |");
console.log("| --- | --- | --- |");

for (const leak of [0, 0.2, 0.5, 0.8]) {
  // 训练语料：抽 leak 比例的评测题的**同义改写**放进去（真实世界的泄漏形态）
  const trainCorpus = new Map();
  for (let i = 0; i < N_EVAL; i++) {
    const leaked = rand() < leak;
    trainCorpus.set(i, leaked ? `配置服务-${i} 重试与超时的方法` : null); // 改写≠原文
  }
  // 评测
  let correct = 0;
  const flagged = new Set();
  const trainGrams = new Set();
  for (const [, text] of trainCorpus) if (text) for (const g of grams(text)) trainGrams.add(g);

  for (let i = 0; i < N_EVAL; i++) {
    const seen = trainCorpus.get(i) !== null;
    if (answer(seen)) correct++;
    // 检测器：评测题与训练语料的 n-gram 重叠率超阈值即判为泄漏
    let overlap = 0;
    const gs = [...grams(q(i))];
    for (const g of gs) if (trainGrams.has(g)) overlap++;
    if (overlap / gs.length > 0.2) flagged.add(i);
  }
  const acc = correct / N_EVAL;
  // 检测质量：本合成世界里改写保留了关键槽位词，n-gram 应能精确命中
  let tp = 0;
  for (let i = 0; i < N_EVAL; i++) {
    if (flagged.has(i) && trainCorpus.get(i) !== null) tp++;
  }
  const precision = flagged.size ? tp / flagged.size : 1;
  const recall = tp / Math.round(N_EVAL * leak || 1);
  console.log(`| ${(leak * 100).toFixed(0)}% | ${(acc * 100).toFixed(1)}% | +${((acc - P_BASE) * 100).toFixed(1)}pp |`);
  table += `${leak}\t${acc.toFixed(4)}\tp=${precision.toFixed(3)}\tr=${recall.toFixed(3)}\n`;
}
writeFileSync(new URL("./last-run.json", import.meta.url), table);
