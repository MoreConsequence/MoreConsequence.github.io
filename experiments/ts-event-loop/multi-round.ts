// P0-05 验收实验：多轮延迟分布（替代单轮输出）。
// 三组同语义对比，每组跑 30 轮，输出 min/p50/p95/max：
//   A) Go: GOMAXPROCS=1 下 goroutine 睡眠 10ms 的唤醒延迟（声明 10ms - 实际唤醒）
//   B) Node: 10ms timer 在空事件循环下的实际延迟基线
//   C) Node: 10ms timer 被主线程 50ms busy loop 阻塞后的实际延迟
// 其中 C 与 B 的差就是主线程 CPU 工作抢占事件循环的代价。
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const roundsArg = Number(process.argv[2] ?? "30");
const rounds = Number.isInteger(roundsArg) && roundsArg >= 1 ? roundsArg : 30;

function stats(name: string, samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const p = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  console.log(
    `${name}: n=${s.length} min=${s[0].toFixed(1)}ms p50=${p(0.5).toFixed(1)}ms p95=${p(0.95).toFixed(1)}ms max=${s.at(-1)!.toFixed(1)}ms`,
  );
  return samples;
}

// A) Go 唤醒延迟分布（GOMAXPROCS=1，反复运行 30 次，每次取 10ms goroutine 的唤醒延迟）
const goLatencies: number[] = [];
for (let i = 0; i < rounds; i++) {
  const goOut = spawnSync("go", ["run", "./go-sleep.go"], { cwd: here, encoding: "utf8" }).stdout;
  for (const line of goOut.split("\n")) {
    const m = line.match(/(\d+)ms goroutine finished at (\d+)ms/);
    if (m && Number(m[1]) === 10) goLatencies.push(Number(m[2]) - Number(m[1]));
  }
}
stats("A Go 10ms 唤醒延迟(30 轮, GOMAXPROCS=1)", goLatencies);
console.log(`  示例输出: 10ms goroutine finished at 12ms / 50ms goroutine finished at 52ms`);

// B/C) Node timer 延迟分布：跑子进程采样，避免主进程自身负载污染每轮计时
const tmpDir = mkdtempSync(join(tmpdir(), "ts-event-loop-probe-"));
const ns = (mode: string) => {
  const code = `
    const t0 = performance.now();
    const declared = 10;
    ${mode === "blocked" ? "const until = performance.now() + 50; while (performance.now() < until) {}" : ""}
    setTimeout(() => {
      const actual = performance.now() - t0;
      console.log(actual.toFixed(3));
    }, declared);
  `;
  const tmp = join(tmpDir, `__probe_${mode}.mjs`);
  writeFileSync(tmp, code);
  const out = spawnSync(process.execPath, [tmp], { cwd: here, encoding: "utf8" }).stdout.trim();
  return Number(out);
};

const nodeBase: number[] = [];
const nodeBlocked: number[] = [];
for (let i = 0; i < rounds; i++) {
  nodeBase.push(ns("base"));
  nodeBlocked.push(ns("blocked"));
}
stats("B Node 10ms timer 基线延迟", nodeBase);
stats("C Node 10ms timer + 50ms busy loop 延迟", nodeBlocked);
const medianBlocked = [...nodeBlocked].sort((a, b) => a - b)[Math.floor(rounds / 2)];
const medianBase = [...nodeBase].sort((a, b) => a - b)[Math.floor(rounds / 2)];
console.log(`阻塞代价：p50(C)-p50(B) = ${(medianBlocked - medianBase).toFixed(1)}ms（≈50ms busy loop 被完整推迟到事件循环重新获得执行机会之后）`);

// 落盘 raw（smoke 轮次不落盘，避免污染正式证据文件）
if (rounds >= 30) {
  const dir = join(here, "..", "..", "evidence", "typescript-event-loop-vs-gmp", "2026-08-19-local");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "multi-round-dist.txt"),
    [
      `# P0-05 多轮延迟分布（${rounds} 轮，Node ${process.version}，Go $(go version)）`,
      "",
      `A Go 10ms 唤醒延迟: ${goLatencies.map((v) => v.toFixed(1)).join(",")}`,
      `B Node 10ms timer 基线: ${nodeBase.map((v) => v.toFixed(1)).join(",")}`,
      `C Node 10ms timer + 50ms busy: ${nodeBlocked.map((v) => v.toFixed(1)).join(",")}`,
      "",
    ].join("\n"),
  );
  console.log("raw 已落盘 evidence/typescript-event-loop-vs-gmp/2026-08-19-local/multi-round-dist.txt");
} else {
  console.log("smoke 模式（非 30 轮）：不落盘 raw");
}
rmSync(tmpDir, { recursive: true, force: true });