# 上下文驱逐三策略：预算 8 格、20 条 planted facts，测各策略召回哪几条。
# 纯标准库合成实验，不证明真实模型。运行：python3 evict.py
import sys

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


FACTS = [f"fact-{i}" for i in range(20)]
BUDGET = 8


def recall(kept):
    return sum(1 for f in FACTS if f in kept), sorted(kept)


# E1：截尾（保头）：留前 8 条。
n1, k1 = recall(FACTS[:8])
check("E1 截尾召回 8/20 且全是头部", n1 == 8 and k1[0] == "fact-0" and k1[-1] == "fact-7", f"{n1}/20")

# E2：滑窗（保尾）：留后 8 条。
n2, k2 = recall(FACTS[-8:])
check("E2 滑窗召回 8/20 且全是尾部", n2 == 8 and k2[0] == "fact-12", f"{n2}/20")

# E3：头+尾（保 2 头 + 6 尾）：两端兼顾，中段全丢。
kept3 = FACTS[:2] + FACTS[-6:]
n3, k3 = recall(kept3)
check("E3 头尾召回 8/20 且跨两端", n3 == 8 and "fact-0" in k3 and "fact-19" in k3 and "fact-10" not in k3,
      f"{n3}/20")

# E4：预算内召回恒 8——策略改变的是“保住哪 8 条”，不是数量。
check("E4 策略只改变分布不改变数量", n1 == n2 == n3 == BUDGET)

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
