# p99 样本量模拟:从已知分布采样,比较不同样本量下样本 p99 的波动,
# 以及"三次运行取最小"这类常见做法 vs 分位数置信区间。
import random
import statistics

def sample_p99(n, dist):
    xs = [dist() for _ in range(n)]
    k = max(1, int(n * 0.99))
    return sorted(xs)[k - 1]

def run():
    rng = random.Random(42)
    # 分布 A: 正常延迟 ~exp(mean=5ms) + 尾部 1.5% 的 200ms 停顿(缓存 miss 等)
    def dist_a():
        if rng.random() < 0.015:
            return 200.0 + rng.expovariate(1 / 50.0)
        return rng.expovariate(1 / 5.0)
    # 分布 B: 纯指数(无重尾), 同样均值
    def dist_b():
        return rng.expovariate(1 / 5.0)

    true_a = 0
    # 理论 p99 近似: 0.985 分位 exp(1/5) + 0.015 分位 exp(1/50)
    # 用大样本估计"真值"
    big = sorted(dist_a() for _ in range(10_000_000))
    true_a = big[int(10_000_000 * 0.99)]
    bigb = sorted(dist_b() for _ in range(10_000_000))
    true_b = bigb[int(10_000_000 * 0.99)]

    print(f"真值: 重尾分布 p99={true_a:.2f}ms, 纯指数 p99={true_b:.2f}ms")
    print(f"{'样本量':>8} {'重尾 p99 中位':>16} {'IQR':>10} {'纯指数 中位':>14} {'IQR':>10}")
    for n in (100, 300, 1000, 3000, 10000):
        pa, pb = [], []
        for _ in range(400):
            pa.append(sample_p99(n, dist_a))
            pb.append(sample_p99(n, dist_b))
        pa.sort(); pb.sort()
        ma = statistics.median(pa)
        mb = statistics.median(pb)
        ia = pa[200] - pa[100]
        ib = pb[200] - pb[100]
        print(f"{n:>8} {ma:>14.2f}ms {ia:>9.2f} {mb:>13.2f}ms {ib:>9.2f}")

    # "三次运行取最小" 的偏差: 1000 样本跑 20 次取 min vs 全体
    mins = [min(sample_p99(1000, dist_a) for _ in range(3)) for _ in range(200)]
    print(f"\n'3 次运行取最小' p99 均值={statistics.mean(mins):.2f}ms, 低估倍数={true_a/statistics.mean(mins):.2f}x")
    print(f"说明: 样本量翻 10 倍, 重尾 p99 的 IQR 才从 {statistics.median([sorted([sample_p99(100,dist_a) for _ in range(50)])[24]-sorted([sample_p99(100,dist_a) for _ in range(50)])[12] for _ in range(8)]):.0f}ms 量级收窄")

if __name__ == "__main__":
    run()
