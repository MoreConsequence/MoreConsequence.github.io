# pass@k 无偏估计：朴素 c/n 系统性低估，组合子公式无偏。
# 真实 p=0.3，每题 n=10 采样，k=2，真值 1-(1-p)^2=0.51。运行：python3 passk.py
import math
import random

rng = random.Random(42)
P, N, K, PROBLEMS = 0.3, 10, 2, 2000
TRUTH = 1 - (1 - P) ** K  # 0.51


def unbiased(c):
    if N - c < K:
        return 1.0
    return 1 - math.comb(N - c, K) / math.comb(N, K)


naive_sum = unbiased_sum = 0.0
for _ in range(PROBLEMS):
    c = sum(1 for _ in range(N) if rng.random() < P)
    naive_sum += c / N
    unbiased_sum += unbiased(c)
naive, unbiased_mean = naive_sum / PROBLEMS, unbiased_sum / PROBLEMS
print(f"真值 pass@2={TRUTH:.3f} | 朴素均值={naive:.3f} | 无偏均值={unbiased_mean:.3f}")

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


check("K1 朴素估计锁定在 p 附近（低估）", abs(naive - P) < 0.02, f"{naive:.3f} vs p={P}")
check("K2 无偏估计锁定真值", abs(unbiased_mean - TRUTH) < 0.02, f"{unbiased_mean:.3f} vs {TRUTH:.3f}")
check("K3 偏差方向正确", naive < unbiased_mean - 0.15, f"差 {unbiased_mean - naive:.3f}")
print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
raise SystemExit(1 if fails else 0)
