# FTS5 vs LIKE：同召回、可排序、前缀可查。
# 纯标准库 sqlite3。运行：python3 fts.py
import sqlite3
import sys

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


con = sqlite3.connect(":memory:")
con.execute("CREATE TABLE docs(id INTEGER PRIMARY KEY, body TEXT)")
con.execute("CREATE VIRTUAL TABLE docs_fts USING fts5(body, content='docs', content_rowid='id')")
rows = []
for i in range(200):
    if i % 7 == 0:
        rows.append((f"订单退款流程说明 refund-{i}",))
    else:
        rows.append((f"普通通知内容 notice-{i}",))
con.executemany("INSERT INTO docs(body) VALUES (?)", rows)
con.execute("INSERT INTO docs_fts(docs_fts) VALUES ('rebuild')")
con.execute("CREATE VIRTUAL TABLE docs_tri USING fts5(body, content='docs', content_rowid='id', tokenize='trigram')")
con.execute("INSERT INTO docs_tri(docs_tri) VALUES ('rebuild')")

like = {r[0] for r in con.execute("SELECT id FROM docs WHERE body LIKE '%退款流程%'")}
default_fts = {r[0] for r in con.execute("SELECT rowid FROM docs_fts WHERE docs_fts MATCH '退款流程'")}
check("T0 默认分词切不动中文", len(default_fts) == 0, f"默认 {len(default_fts)} 行（预期行为，非 bug）")
# trigram 按 3-gram 建索引：查询至少 3 个 token（中文一字一 token，故用 4 字词）。
tri = {r[0] for r in con.execute("SELECT rowid FROM docs_tri WHERE docs_tri MATCH '退款流程'")}
check("T1 trigram 与 LIKE 同召回", like == tri and len(tri) == 29, f"各 {len(tri)} 行")

ranked = con.execute("SELECT rowid, bm25(docs_tri) FROM docs_tri WHERE docs_tri MATCH '退款流程' ORDER BY bm25(docs_tri)").fetchall()
check("T2 bm25 可排序", len(ranked) == 29 and all(isinstance(r[1], float) for r in ranked))

prefix = {r[0] for r in con.execute("SELECT rowid FROM docs_fts WHERE docs_fts MATCH 'refun*'")}
check("T3 前缀可查", len(prefix) == 29, f"{len(prefix)} 行")

print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
sys.exit(1 if fails else 0)
