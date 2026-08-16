// 05 可观测性：零依赖指标——计数器 + 按操作/结果分组的延迟样本。
// 这是教学用内存实现，不是 Prometheus client；它只演示 SLI 的数据形状。
export type MetricOutcome =
  | "ok"
  | "not_found"
  | "validation_failed"
  | "conflict"
  | "error"
  | "other";

type Stats = { n: number; p50: number; p95: number; p99: number };

export class Metrics {
  private counters = new Map<string, number>();
  private latencies = new Map<string, Map<MetricOutcome, number[]>>();
  private readonly maxSamples: number;

  constructor(maxSamples = 10_000) {
    if (!Number.isInteger(maxSamples) || maxSamples < 1) {
      throw new Error("maxSamples must be a positive integer");
    }
    this.maxSamples = maxSamples;
  }

  inc(name: string, by = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }
  observe(name: string, ms: number, outcome: MetricOutcome) {
    const byOutcome = this.latencies.get(name) ?? new Map<MetricOutcome, number[]>();
    const samples = byOutcome.get(outcome) ?? [];
    samples.push(ms);
    if (samples.length > this.maxSamples) samples.shift(); // 有界窗口，避免示例自身无限增长
    byOutcome.set(outcome, samples);
    this.latencies.set(name, byOutcome);
  }

  private stats(samples: number[]): Stats {
    const sorted = [...samples].sort((a, b) => a - b);
    const p = (q: number) => sorted.length === 0
      ? 0
      : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    return {
      n: sorted.length,
      p50: p(0.5),
      p95: p(0.95),
      p99: p(0.99),
    };
  }

  snapshot() {
    const latencies: Record<string, Partial<Record<MetricOutcome, Stats>>> = {};
    for (const [name, byOutcome] of this.latencies) {
      latencies[name] = Object.fromEntries(
        [...byOutcome].map(([outcome, samples]) => [outcome, this.stats(samples)])
      );
    }
    return {
      counters: Object.fromEntries(this.counters),
      latencies,
    };
  }
}
