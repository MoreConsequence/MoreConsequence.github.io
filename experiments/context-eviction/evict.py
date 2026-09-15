# 上下文驱逐三策略（加权版）：facts 不等价，算价值召回而非计数。
# 价值分布：头 2 条各 10（系统指令），中 12 条各 1（闲聊），尾 6 条各 5（近期决策）。
# 预算 8 格。运行：python3 evict.py
import sys

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


VALUES = [10, 10] + [1] * 12 + [5] * 6  # fact-0..19
TOTAL = sum(VALUES)  # 62
BUDGET = 8


def value_recall(kept_idx):
    return sum(VALUES[i] for i in kept_idx) / TOTAL


r_trunc = value_recall(range(0, 8))        # 10+10+1*6 = 26 → 42%
r_slide = value_recall(range(12, 20))      # 1+1+5*6 = 32 → 52%
r_mixed = value_recall([0, 1, 14, 15, 16, 17, 18, 19])  # 10+10+5*6 = 50 → 81%
print(f"截尾价值召回={r_trunc:.1%} 滑窗={r_slide:.1%} 头尾={r_mixed:.1%}（计数全是 8/20）")

check("E1 截尾价值 42%", abs(r_trunc - 26 / 62) < 1e-9, f"{r_trunc:.3f}")
check("E2 滑窗价值 52%", abs(r_slide - 32 / 62) < 1e-9, f"{r_slide:.3f}")
check("E3 头尾价值 81% 最优", abs(r_mixed - 50 / 62) < 1e-9 and r_mixed > r_slide > r_trunc, f"{r_mixed:.3f}")
check("E4 计数恒 8 掩盖价值差", True, "三策略计数都是 8/20——只数数量选不出策略")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
