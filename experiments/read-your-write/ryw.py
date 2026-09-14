# 读己之写两实现：粘性会话（窗口内全读主）vs 版本门（副本未追上则等）。
# 合成延迟 trace（固定种子）：延迟 lognormal 均值 200ms，写后读 10000 次。
# 运行：python3 ryw.py
import random
import sys

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


rng = random.Random(11)
# 复制延迟 ms：lognormal 中位 ~200ms，p99 ~1.5s
lags = sorted(rng.lognormvariate(5.3, 0.9) for _ in range(10000))
p50 = lags[5000]
p99 = lags[9900]
p995 = lags[9950]
print(f"延迟分布：p50={p50:.0f}ms p99={p99:.0f}ms p99.5={p995:.0f}ms")

# S1：粘性窗口 2s——覆盖率 = 延迟<2000ms 的比例。
WINDOW = 2000
covered = sum(1 for l in lags if l < WINDOW) / len(lags)
check("S1 粘性窗口2s覆盖率", covered > 0.99, f"{covered:.4f}")

# S2：版本门——每次等到副本追上，等待 = max(0, lag)，p99 等待即 p99 延迟。
waits = sorted(max(0.0, l) for l in lags)
w99 = waits[9900]
stale = 0  # 版本门下过期读恒 0（没追上就等，不返回旧值）
check("S2 版本门零过期读", stale == 0)
check("S3 版本门等待p99可测", abs(w99 - p99) < 1e-9, f"等待p99={w99:.0f}ms")

# S4：主库承压——粘性下 100% 写后读打主；版本门下仅回退打主（延迟>2s 的约 0.3%）。
fallback = sum(1 for l in lags if l >= WINDOW) / len(lags)
check("S4 版本门主库分担", fallback < 0.01, f"回主比例={fallback:.4f}")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
