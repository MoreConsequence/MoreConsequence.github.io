# G-Counter：合并满足交换/结合/幂等，并发增量不丢数。
# 加固：PN-Counter（增减各一槽）回答“减法怎么办”。
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


class PNCounter:
    """减法答案：增减各一槽，值 = inc 槽和 - dec 槽和，合并仍逐槽 max。"""

    def __init__(self, n, i):
        self.p = [0] * n
        self.q = [0] * n
        self.i = i

    def inc(self, k=1):
        self.p[self.i] += k

    def dec(self, k=1):
        self.q[self.i] += k

    def value(self):
        return sum(self.p) - sum(self.q)

    def merge(self, o):
        c = PNCounter(len(self.p), self.i)
        c.p = [max(a, b) for a, b in zip(self.p, o.p)]
        c.q = [max(a, b) for a, b in zip(self.q, o.q)]
        return c


# C4：并发加减——A 加 10 减 3，B 加 5 减 8，合并恒为 4。
x, y = PNCounter(2, 0), PNCounter(2, 1)
x.inc(10)
x.dec(3)
y.inc(5)
y.dec(8)
v1 = x.merge(y).value()
v2 = y.merge(x).value()
check("C4 PN 加减收敛", v1 == v2 == 4, f"{v1}/{v2}")

# C5：减法不丢——重复合并减量不 double 花。
v3 = x.merge(y).merge(y).value()
check("C5 减量合并幂等", v3 == 4, f"{v3}")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
