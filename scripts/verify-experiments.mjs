import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const node = process.execPath;

const checks = [
  {
    name: "service typecheck",
    cwd: "experiments/service",
    executable: node,
    args: ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--noEmit"],
  },
  {
    name: "service tests",
    cwd: "experiments/service",
    executable: node,
    args: ["node_modules/vitest/vitest.mjs", "run"],
  },
  {
    name: "service build",
    cwd: "experiments/service",
    executable: node,
    args: ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
  },
  {
    name: "service store-growth smoke",
    cwd: "experiments/service",
    executable: node,
    args: ["scripts/store-growth.ts", "500", "100"],
  },
  {
    name: "agent tests",
    cwd: "experiments/ts-agent-prod",
    executable: node,
    args: ["--test", "prod.test.mjs"],
  },
  {
    name: "agent demo",
    cwd: "experiments/ts-agent-prod",
    executable: node,
    args: ["prod.ts"],
  },
  {
    name: "schema typecheck",
    cwd: "experiments/ts-interface-schema",
    executable: node,
    args: ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--noEmit"],
  },
  {
    name: "schema runtime demo",
    cwd: "experiments/ts-interface-schema",
    executable: node,
    args: ["main.ts"],
  },
  {
    name: "schema bundle sizes",
    cwd: "experiments/ts-interface-schema",
    executable: node,
    args: ["scripts/bundle-sizes.mjs"],
  },
  {
    name: "streams smoke",
    cwd: "experiments/ts-streams",
    executable: node,
    args: ["--expose-gc", "memory.ts", "--mode=readable", "--count=1000", "--payload-bytes=32", "--high-water-mark=16"],
  },
  {
    name: "event-loop smoke",
    cwd: "experiments/ts-event-loop",
    executable: node,
    args: ["order.ts"],
  },
  {
    name: "event-loop timer smoke",
    cwd: "experiments/ts-event-loop",
    executable: node,
    args: ["blocking2.ts"],
  },
  {
    name: "state machine demo",
    cwd: "experiments/ts-state-machine",
    executable: node,
    args: ["fsm.ts"],
  },
  {
    name: "DTO boundary demo",
    cwd: "experiments/ts-dto-boundary",
    executable: node,
    args: ["main.ts"],
  },
  {
    name: "Result and throw demo",
    cwd: "experiments/ts-errors",
    executable: node,
    args: ["result-vs-throw.ts"],
  },
  {
    name: "type gymnastics typecheck",
    cwd: ".",
    executable: node,
    args: ["node_modules/typescript/bin/tsc", "-p", "experiments/ts-type-gymnastics/tsconfig.json", "--noEmit"],
  },
  {
    name: "type gymnastics registry demo",
    cwd: "experiments/ts-type-gymnastics",
    executable: node,
    args: ["registry2.ts"],
  },
  {
    name: "type gymnastics literal demo",
    cwd: "experiments/ts-type-gymnastics",
    executable: node,
    args: ["literal.ts"],
  },
  {
    name: "goroutine smoke",
    cwd: "experiments/ts-event-loop",
    executable: "go",
    args: ["run", "go-sleep.go"],
  },
  {
    name: "Go runtime boundary probes",
    cwd: "experiments",
    executable: "go",
    args: [
      "test",
      "./go-runtime-boundary",
      "-run",
      "^TestSubsliceRetainsBackingArray$",
      "-bench",
      "^(BenchmarkAppend|BenchmarkGoroutineCreateJoin|BenchmarkAtomic|BenchmarkMutex|BenchmarkSpin|BenchmarkErrorsIs10|BenchmarkInterfaceDispatch|BenchmarkSyncPool256|BenchmarkMapLookup|BenchmarkChannel|BenchmarkSelect(1|2|4|8)CaseDefault|BenchmarkSyncMap|BenchmarkAtomicValueRead|BenchmarkTimeAfter|BenchmarkNewTimer|BenchmarkStringFromBytes32|BenchmarkBytesFromString32|BenchmarkStringFromBytes8K|BenchmarkBytesFromString8K|BenchmarkUnsafeString|BenchmarkStringPlusLoop|BenchmarkStringBuilderLoop)",
      "-benchmem",
      "-benchtime=100ms",
      "-cpu=8",
    ],
  },
  {
    name: "Go select fairness smoke",
    cwd: "experiments",
    executable: "go",
    args: ["run", "./go-runtime-boundary/cmd/select-fairness", "-n=1000000"],
  },
  {
    name: "Go stack growth smoke",
    cwd: "experiments",
    executable: "go",
    args: [
      "run",
      "./go-runtime-boundary/cmd/stack-growth",
      "-depths=1000,100000,1000000",
      "-repeats=3",
    ],
  },
  {
    name: "Go slice retention retained",
    cwd: "experiments",
    executable: "go",
    args: [
      "run",
      "./go-runtime-boundary/cmd/slice-retention",
      "-mode=retained",
      "-total=4096",
      "-keep=10",
      "-width=256",
    ],
  },
  {
    name: "Go slice retention copied",
    cwd: "experiments",
    executable: "go",
    args: [
      "run",
      "./go-runtime-boundary/cmd/slice-retention",
      "-mode=copied",
      "-total=4096",
      "-keep=10",
      "-width=256",
    ],
  },
  {
    name: "Go gctrace program smoke",
    cwd: "experiments",
    executable: "go",
    args: ["run", "./go-runtime-boundary/cmd/gc-trace", "-n=1000"],
  },
  {
    name: "consistent hashing deterministic demo",
    cwd: ".",
    executable: "python3",
    args: ["experiments/consistent-hashing-boundary/consistent_hash.py"],
  },
  {
    name: "tree shaking boundary demo",
    cwd: "experiments/ts-interface-schema",
    executable: node,
    args: ["scripts/tree-shaking-boundary.mjs"],
  },
  {
    name: "LLM tool-calling error contract demo",
    cwd: ".",
    executable: node,
    args: ["experiments/llm-tool-calling-contract/simulate.mjs"],
  },
  {
    name: "LLM hallucination measurement demo",
    cwd: ".",
    executable: node,
    args: ["experiments/llm-hallucination-measurable/measure.mjs"],
  },
  {
    name: "LLM judge stub demo",
    cwd: ".",
    executable: "python3",
    args: ["experiments/llm-judge/llm_judge_position_bias.py", "--judge", "stub"],
  },
  {
    name: "LLM batching simulator",
    cwd: ".",
    executable: "python3",
    args: ["experiments/llm-batching/sim.py", "--arrivals", "2,8,32"],
  },
  {
    name: "mini LSM amplification sweep",
    cwd: "experiments",
    executable: "go",
    args: ["run", "./mini-lsm", "-num", "1000", "-writes", "1500", "-mem", "100", "-sweep"],
  },
  {
    name: "Go netpoll wakeup benchmark",
    cwd: "experiments",
    executable: "go",
    args: ["test", "./go-netpoll", "-run", "^$", "-bench", "WakeupLatency", "-benchtime=100ms", "-count=1"],
  },
];

for (const check of checks) {
  console.log(`\n== ${check.name} ==`);
  const result = spawnSync(check.executable, check.args, {
    cwd: resolve(root, check.cwd),
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`${check.name} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${check.name} exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nAll experiment checks passed.");
