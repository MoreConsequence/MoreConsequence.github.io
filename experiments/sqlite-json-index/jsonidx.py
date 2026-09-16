# SQLite JSON1 生成列索引：json_extract 建索引，查询走索引不扫表。
# 纯标准库 sqlite3。运行：python3 jsonidx.py
import sqlite3
import sys

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


con = sqlite3.connect(":memory:")
# 注意：ALTER 只能加 VIRTUAL 生成列，STORED 必须建表时声明——这本身就是一个坑。
con.execute("""CREATE TABLE orders(id INTEGER PRIMARY KEY, body TEXT,
               sku TEXT GENERATED ALWAYS AS (json_extract(body, '$.sku')) STORED)""")
con.executemany("INSERT INTO orders(body) VALUES (?)",
                [(f'{{"sku":"SKU-{i % 50}","qty":{i}}}',) for i in range(5000)])
con.execute("CREATE INDEX idx_sku ON orders(sku)")

plan = con.execute("EXPLAIN QUERY PLAN SELECT * FROM orders WHERE sku = 'SKU-7'").fetchall()
uses_index = any("idx_sku" in str(row).lower() or "index" in str(row).lower() for row in plan)
check("J1 生成列索引被使用", uses_index, str(plan))

rows = con.execute("SELECT COUNT(*) FROM orders WHERE sku = 'SKU-7'").fetchone()[0]
check("J2 结果正确", rows == 100, f"count={rows}")

# J3：无索引对照——删索引后同查询全表扫描（行为对照，非性能断言）。
# 注意：必须换查询文本（加恒真谓词），否则连接内的预编译语句缓存会返回删索引前的旧计划。
con.execute("DROP INDEX idx_sku")
plan2 = con.execute("EXPLAIN QUERY PLAN SELECT * FROM orders WHERE sku = 'SKU-7' AND id >= 0").fetchall()
scan = "idx_sku" not in str(plan2).lower()
check("J3 删索引后计划不再引用它", scan, str(plan2))

# J4（加固）：ALTER 加 VIRTUAL 列同样可索引——STORED 的建表限制不适用于 VIRTUAL。
con.execute("ALTER TABLE orders ADD COLUMN qty_v INTEGER GENERATED ALWAYS AS (CAST(json_extract(body, '$.qty') AS INTEGER)) VIRTUAL")
con.execute("CREATE INDEX idx_qty ON orders(qty_v)")
plan4 = con.execute("EXPLAIN QUERY PLAN SELECT * FROM orders WHERE qty_v > 4900").fetchall()
check("J4 VIRTUAL 列可后加可索引", any("idx_qty" in str(r).lower() for r in plan4), str(plan4))

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
