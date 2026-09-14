# 重试放大倍数：失败率 p、最多 3 次重试时，下游负载放大 1+p+p²+p³。
# 附带预算规则：p 超 10% 即停重试。纯算术。运行：python3 retry.py
import sys

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def amp(p, retries=3):
    return sum(p ** i for i in range(retries + 1))


a2 = amp(0.02)
check("R1 p=2% 时放大仅 1.0204x", abs(a2 - 1.020408) < 1e-9, f"{a2:.6f}x")

a20 = amp(0.20)
check("R2 p=20% 时放大 1.248x（风暴形状）", abs(a20 - 1.248) < 1e-9, f"{a20:.4f}x")

# R3：预算规则——p>10% 停重试，放大恒 1.0，避免雪崩。
capped = amp(0.20, 0) if 0.20 > 0.10 else amp(0.20)
check("R3 熔断后放大回 1.0", capped == 1.0, f"{capped}x")

# R4：正常期（p=0.1%）重试成本可忽略，保留重试的收益。
check("R4 p=0.1% 放大约 1.001x", abs(amp(0.001) - 1.001001) < 1e-9, f"{amp(0.001):.6f}x")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
