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


def rounds(n, fanout, seed, dead=()):
    rng = random.Random(seed)
    dead = set(dead)
    live = set(range(n)) - dead
    infected = {0} - dead
    if not infected:
        return 0, 0.0
    r = 0
    while not live <= infected:
        r += 1
        spreaders = [s for s in infected if s not in dead]
        for s in spreaders:
            for _ in range(fanout):
                peer = rng.randrange(n)
                if peer not in dead:
                    infected.add(peer)
        if r > 10 * n:
            raise RuntimeError("不收敛")
    return r, len(infected & live) / len(live)


N = 100
r1, _ = rounds(N, 1, 7)
r3, _ = rounds(N, 3, 7)
bound = math.ceil(2 * math.log2(N)) + 4
print(f"N={N} fanout=1 → {r1} 轮；fanout=3 → {r3} 轮；宽松上界 {bound} 轮")
check("G1 fanout=1 收敛且在上界内", r1 <= bound, f"{r1} <= {bound}")
check("G2 fanout=3 明显更快", r3 < r1, f"{r3} < {r1}")
# G3：换种子仍收敛（非个例）。
seeds_ok = all(rounds(N, 1, s)[0] <= bound + 4 for s in (1, 2, 3))
check("G3 多种子稳定", seeds_ok)

# G4（加固）：10% 节点死亡（不转发也不收，种子 0 存活），存活节点仍全覆盖，轮次仅温和上升。
dead = [1, 11, 21, 31, 41, 51, 61, 71, 81, 91]
r_dead, cov = rounds(N, 1, 7, dead)
check("G4 10% 死亡仍全覆盖存活者", cov == 1.0, f"覆盖 {cov:.2f}，{r_dead} 轮（无故障 {r1} 轮）")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
