# cursor 翻页 vs offset：并发写入下 offset 重行，cursor 不重不漏。
# 纯标准库 sqlite3。运行：python3 pages.py
import os
import sqlite3
import sys
import tempfile

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


db = os.path.join(tempfile.mkdtemp(prefix="page-demo-"), "demo.db")
con = sqlite3.connect(db)
con.execute("CREATE TABLE feed(id INTEGER PRIMARY KEY, ts INTEGER)")
con.executemany("INSERT INTO feed(ts) VALUES (?)", [(i,) for i in range(1, 21)])
con.commit()

# offset 形状：第一页后写入 2 行更新的，第二页 OFFSET 5。
p1 = [r[0] for r in con.execute("SELECT ts FROM feed ORDER BY ts DESC LIMIT 5")]
con.executemany("INSERT INTO feed(ts) VALUES (?)", [(21,), (22,)])
con.commit()
p2 = [r[0] for r in con.execute("SELECT ts FROM feed ORDER BY ts DESC LIMIT 5 OFFSET 5")]
overlap = set(p1) & set(p2)
check("O1 offset 并发写入下重行", len(overlap) == 2, f"p1={p1} p2={p2} 重叠={sorted(overlap)}")

# cursor 形状：WHERE ts < 上页末位，同样写入下无重无漏。
c1 = [r[0] for r in con.execute("SELECT ts FROM feed ORDER BY ts DESC LIMIT 5")]
con.executemany("INSERT INTO feed(ts) VALUES (?)", [(23,), (24,)])
con.commit()
c2 = [r[0] for r in con.execute("SELECT ts FROM feed WHERE ts < ? ORDER BY ts DESC LIMIT 5", (c1[-1],))]
check("O2 cursor 无重行", not (set(c1) & set(c2)), f"c1={c1} c2={c2}")
check("O3 cursor 连续（差 1 衔接）", c1[-1] - c2[0] == 1, f"{c1[-1]}→{c2[0]}")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
