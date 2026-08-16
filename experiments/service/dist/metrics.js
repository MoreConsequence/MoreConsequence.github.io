export class Metrics {
    counters = new Map();
    latencies = new Map();
    maxSamples;
    constructor(maxSamples = 10_000) {
        if (!Number.isInteger(maxSamples) || maxSamples < 1) {
            throw new Error("maxSamples must be a positive integer");
        }
        this.maxSamples = maxSamples;
    }
    inc(name, by = 1) {
        this.counters.set(name, (this.counters.get(name) ?? 0) + by);
    }
    observe(name, ms, outcome) {
        const byOutcome = this.latencies.get(name) ?? new Map();
        const samples = byOutcome.get(outcome) ?? [];
        samples.push(ms);
        if (samples.length > this.maxSamples)
            samples.shift(); // 有界窗口，避免示例自身无限增长
        byOutcome.set(outcome, samples);
        this.latencies.set(name, byOutcome);
    }
    stats(samples) {
        const sorted = [...samples].sort((a, b) => a - b);
        const p = (q) => sorted.length === 0
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
        const latencies = {};
        for (const [name, byOutcome] of this.latencies) {
            latencies[name] = Object.fromEntries([...byOutcome].map(([outcome, samples]) => [outcome, this.stats(samples)]));
        }
        return {
            counters: Object.fromEntries(this.counters),
            latencies,
        };
    }
}
//# sourceMappingURL=metrics.js.map