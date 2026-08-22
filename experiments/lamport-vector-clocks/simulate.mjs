#!/usr/bin/env node
// Lamport 时钟 vs 向量时钟：同一份事件历史，两种记账方式的分歧。
// 固定随机种子保证逐字节可复现。零依赖，Node >= 18。
import { writeFileSync } from "node:fs";

const SEED = 20260823;
const N_PROC = 3;
const TOTAL_EVENTS = 60;

// mulberry32：极简可复现 PRNG
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Process {
  constructor(id, all) {
    this.id = id;
    this.n = all;
    this.lamport = 0;
    this.vc = new Array(all).fill(0);
    this.inbox = [];
    this.events = []; // {type, lamport, vc, peer}
  }

  tick(type, peer) {
    this.lamport += 1;
    this.vc[this.id] += 1;
    this.events.push({ type, peer, lamport: this.lamport, vc: [...this.vc] });
  }

  local() { this.tick("local", null); }

  send(net) {
    this.tick("send", null);
    // 消息携带发送时刻的 (lamport, vc) 快照
    net.push({ from: this.id, lc: this.lamport, vc: [...this.vc] });
  }

  recv(net) {
    const idx = net.findIndex((m) => m.from !== undefined && m.to === this.id);
    const msg = net.splice(idx, 1)[0];
    this.lamport = Math.max(this.lamport, msg.lc) + 1;
    for (let i = 0; i < this.n; i++) this.vc[i] = Math.max(this.vc[i], msg.vc[i]);
    this.tick(`recv←P${msg.from}`, msg.from);
  }
}

function simulate() {
  const rand = rng(SEED);
  const ps = Array.from({ length: N_PROC }, (_, i) => new Process(i, N_PROC));
  const net = [];
  let seq = 0;

  while (seq < TOTAL_EVENTS) {
    const p = ps[Math.floor(rand() * N_PROC)];
    const r = rand();
    const pending = net.filter((m) => m.to === undefined);
    if (r < 0.35) {
      p.local();
    } else if (r < 0.65 || pending.length === 0) {
      const to = Math.floor(rand() * (N_PROC - 1));
      p.send(net);
      net[net.length - 1].to = to >= p.id ? to + 1 : to; // 不发给自己
    } else {
      p.recv(net);
    }
    seq += 1;
  }
  return ps.flatMap((p) =>
    p.events.map((e) => ({ proc: p.id, ...e })),
  );
}

// 因果判定：a → b 当且仅当 VC(a) ≤ VC(b) 且至少一维严格小于
const vcBefore = (a, b) => {
  let less = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return false;
    if (a[i] < b[i]) less = true;
  }
  return less;
};

function analyze(events) {
  let causalPairs = 0, concurrentPairs = 0, lamportLies = 0;
  const lieExamples = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      const concurrent = !vcBefore(a.vc, b.vc) && !vcBefore(b.vc, a.vc);
      if (concurrent) {
        concurrentPairs++;
        // Lamport 全序把并发事件强行排了先后：这就是"谎"
        if (a.lamport !== b.lamport) {
          lamportLies++;
          if (lieExamples.length < 3) {
            lieExamples.push(
              `P${a.proc}${String(a.type).padEnd(8)} L=${a.lamport} VC=[${a.vc}]  vs  P${b.proc}${String(b.type).padEnd(8)} L=${b.lamport} VC=[${b.vc}]`,
            );
          }
        }
      } else {
        causalPairs++;
      }
    }
  }
  return { total: events.length, causalPairs, concurrentPairs, lamportLies, lieExamples };
}

const events = simulate();
const stat = analyze(events);

console.log(`seed=${SEED} · ${N_PROC} 进程 · ${TOTAL_EVENTS} 事件 · 消息传递(local/send/recv)`);
console.log("");
console.log("| # | 进程 | 类型 | Lamport | 向量时钟 |");
console.log("| --- | --- | --- | --- | --- |");
events.slice(0, 14).forEach((e, i) => {
  console.log(`| ${i} | P${e.proc} | ${e.type} | ${e.lamport} | [${e.vc.join(",")}] |`);
});
console.log("…");
console.log("");
console.log(`事件对总数(无序对): ${(stat.total * (stat.total - 1)) / 2}`);
console.log(`因果相关对: ${stat.causalPairs}`);
console.log(`并发对: ${stat.concurrentPairs}`);
console.log(`其中被 Lamport 全序强排出先后的并发对(谎): ${stat.lamportLies}`);
console.log("谎言样例(L 小不代表先发生):");
for (const s of stat.lieExamples) console.log(`  ${s}`);

writeFileSync(new URL("./last-run.json", import.meta.url), JSON.stringify({ seed: SEED, stat }, null, 2));
