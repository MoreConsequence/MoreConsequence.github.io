# SQLite 事务隔离：WAL 下读不阻塞、快照稳定；双写者立即 BUSY。
# 纯标准库 sqlite3。运行：python3 isolation.py
import os
import sqlite3
import sys
import tempfile

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


db = os.path.join(tempfile.mkdtemp(prefix="tx-demo-"), "demo.db")


def conn():
    c = sqlite3.connect(db, timeout=1.0, isolation_level=None)
    return c


setup = conn()
setup.execute("PRAGMA journal_mode=WAL")
setup.execute("CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)")
setup.executemany("INSERT INTO t(v) VALUES (?)", [(f"r{i}",) for i in range(100)])
setup.close()

# I1：读快照稳定——读事务期间他方提交，旧读数不变，提交后才见新数。
r = conn()
r.execute("BEGIN")
before = r.execute("SELECT COUNT(*) FROM t").fetchone()[0]
w = conn()
# isolation_level=None 即 autocommit：单条 INSERT 执行完即提交，无需 COMMIT。
w.execute("INSERT INTO t(v) VALUES ('new')")
during = r.execute("SELECT COUNT(*) FROM t").fetchone()[0]
r.execute("COMMIT")
after = r.execute("SELECT COUNT(*) FROM t").fetchone()[0]
r.close()
w.close()
check("I1 快照期内读数稳定", before == 100 and during == 100, f"before={before} during={during}")
check("I2 提交后见新数", after == 101, f"after={after}")

# I3：双写者——IMMEDIATE 写锁立即 BUSY，不傻等。
w1 = conn()
w1.execute("BEGIN IMMEDIATE")
w1.execute("INSERT INTO t(v) VALUES ('w1')")
w2 = conn()
busy = False
try:
    w2.execute("BEGIN IMMEDIATE")
except sqlite3.OperationalError as e:
    busy = "busy" in str(e).lower() or "locked" in str(e).lower()
w1.execute("ROLLBACK")
w2.close()
check("I3 第二写者立即 BUSY", busy, "RESERVED 锁下不排队")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
