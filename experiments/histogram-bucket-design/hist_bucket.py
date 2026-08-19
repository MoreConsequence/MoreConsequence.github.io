# 直方图桶设计:桶边界如何决定 p99 估计误差。
# 对比: Prometheus 指数桶(error 因子) vs 线性桶 vs 稀疏桶(桶内最大上界近似)。
import random
import statistics
import bisect

def exp_buckets(base, growth, n):
    out = []
    v = base
    for _ in range(n):
        out.append(v)
        v *= growth
    return out

def est_p99(xs, buckets):
    # 按桶计数, p99 落在哪个桶, 用该桶上界估计(最坏误差); 用桶内线性插值(较好)
    counts = [0]*len(buckets)
    for x in xs:
        i = bisect.bisect_left(buckets, x)
        counts[min(i, len(buckets)-1)] += 1
    total = len(xs)
    target = 0.99*total
    acc = 0
    for i, c in enumerate(counts):
        acc += c
        if acc >= target:
            lo = buckets[i-1] if i > 0 else 0
            hi = buckets[i]
            if hi == buckets[-1] and i == len(buckets)-1:
                return hi, hi  # 越界: 上界未知
            # 桶内线性插值估计
            within = acc - target
            frac = 1 - within/c if c > 0 else 1
            return hi, lo + frac*(hi-lo)
    return buckets[-1], buckets[-1]

def run():
    rng = random.Random(7)
    # 真实分布: 95% exp(8ms) + 5% exp(50ms) + 0.05% exp(2000ms)
    def dist():
        r = rng.random()
        if r < 0.0005: return rng.expovariate(1/2000)
        if r < 0.05: return rng.expovariate(1/50)
        return rng.expovariate(1/8)

    big = sorted(dist() for _ in range(5_000_000))
    true_p99 = big[int(5_000_000*0.99)]
    print(f"真值 p99 = {true_p99:.2f}ms")

    sets = {
        "prom-10ms-10x10": exp_buckets(0.01, 1.5, 40),   # 类似 prometheus 0.005 base 1.5
        "linear-0-500-5ms": [i*5 for i in range(1,101)],
        "coarse-2 倍桶": exp_buckets(0.005, 2, 30),
        "无尾部桶(只到 100ms)": exp_buckets(0.005, 1.5, 22),
    }
    print(f"{'桶方案':>22} {'p99 上界估计':>14} {'插值估计':>12} {'越界率':>8}")
    xs = [dist() for _ in range(100_000)]
    for name, buckets in sets.items():
        worst = [est_p99(xs, buckets)[0] for _ in range(1)]
        interp = est_p99(xs, buckets)[1]
        overflow = sum(1 for x in xs if x > buckets[-1])/len(xs)
        print(f"{name:>22} {worst[0]:>12.2f}ms {interp:>10.2f}ms {overflow*100:>7.3f}%")

    # 误差随桶宽的变化: 同 30 个桶, 不同 growth
    for g in (1.3, 1.8, 2.5):
        bs = exp_buckets(0.005, g, 30)
        interp = est_p99(xs, bs)[1]
        rel = abs(interp-true_p99)/true_p99*100
        print(f"growth={g}: p99 插值={interp:.1f}ms 相对误差={rel:.1f}%")

if __name__ == "__main__":
    run()
