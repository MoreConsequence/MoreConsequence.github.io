# SQLite WAL checkpoint：写放大文件先长后消，数据不少一行。
# 纯标准库 sqlite3。运行：python3 wal.py（cwd 无关，库建在系统临时目录）
import os
import sqlite3
import sys
import tempfile

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


tmp = tempfile.mkdtemp(prefix="wal-demo-")
db = os.path.join(tmp, "demo.db")
con = sqlite3.connect(db)
con.execute("PRAGMA journal_mode=WAL").fetchall()
con.execute("CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)")
con.executemany("INSERT INTO t(v) VALUES (?)", [(f"row-{i}",) for i in range(2000)])
con.commit()

wal = db + "-wal"
wal_bytes = os.path.getsize(wal) if os.path.exists(wal) else 0
check("W1 写入后 -wal 文件存在且非空", wal_bytes > 0, f"{wal_bytes}B")

mode, _, _ = con.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
wal_after = os.path.getsize(wal) if os.path.exists(wal) else 0
check("W2 TRUNCATE 后 -wal 归零", wal_after == 0, f"mode={mode} 后 {wal_after}B")

n = con.execute("SELECT COUNT(*) FROM t").fetchone()[0]
check("W3 数据不少一行", n == 2000, f"count={n}")

con.close()
print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
