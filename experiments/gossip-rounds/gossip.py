# gossip 感染轮次：N=100，fanout=1 约 2*log2(N) 轮收敛，fanout=3 更快。
# 纯标准库、固定种子。运行：python3 gossip.py
import math
import random
import sys

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def rounds(n, fanout, seed):
    rng = random.Random(seed)
    infected = {0}
    r = 0
    while len(infected) < n:
        r += 1
        spreaders = list(infected)
        for s in spreaders:
            for _ in range(fanout):
                infected.add(rng.randrange(n))
        if r > 10 * n:
            raise RuntimeError("不收敛")
    return r


N = 100
r1 = rounds(N, 1, 7)
r3 = rounds(N, 3, 7)
bound = math.ceil(2 * math.log2(N)) + 4
print(f"N={N} fanout=1 → {r1} 轮；fanout=3 → {r3} 轮；宽松上界 {bound} 轮")
check("G1 fanout=1 收敛且在上界内", r1 <= bound, f"{r1} <= {bound}")
check("G2 fanout=3 明显更快", r3 < r1, f"{r3} < {r1}")
# G3：换种子仍收敛（非个例）。
seeds_ok = all(rounds(N, 1, s) <= bound + 4 for s in (1, 2, 3))
check("G3 多种子稳定", seeds_ok)

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
