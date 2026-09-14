# G-Counter：合并满足交换/结合/幂等，并发增量不丢数。
# 纯标准库。运行：python3 gcounter.py
import sys

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


class GCounter:
    def __init__(self, n, i):
        self.v = [0] * n
        self.i = i

    def inc(self, k=1):
        self.v[self.i] += k

    def merge(self, o):
        return GCounter.from_vec([max(a, b) for a, b in zip(self.v, o.v)], self.i)

    @staticmethod
    def from_vec(v, i):
        c = GCounter(len(v), i)
        c.v = list(v)
        return c

    def total(self):
        return sum(self.v)


N = 3
a, b, c = GCounter(N, 0), GCounter(N, 1), GCounter(N, 2)
for _ in range(5):
    a.inc()
for _ in range(7):
    b.inc()
for _ in range(11):
    c.inc()

# C1：合并顺序无关（交换+结合），总数恒 23。
m1 = a.merge(b).merge(c).total()
m2 = c.merge(a).merge(b).total()
m3 = b.merge(c).merge(a).total()
check("C1 合并顺序无关", m1 == m2 == m3 == 23, f"{m1}/{m2}/{m3}")

# C2：幂等——重复合并同副本，总数不变。
m4 = a.merge(b).merge(b).merge(a).total()
check("C2 重复合并幂等", m4 == 12, f"{m4}")

# C3：槽位隔离——各节点只写自己槽，他方合并即见。
d, e = GCounter(2, 0), GCounter(2, 1)
d.inc(3)
merged = e.merge(d)
check("C3 跨副本可见", merged.total() == 3 and merged.v == [3, 0], f"{merged.v}")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
