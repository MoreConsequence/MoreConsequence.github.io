---
title: "SQLite 索引两形态：FTS5 全文 vs JSON 生成列"
description: "同一 SQLite 里的两种索引答案：中文全文走 FTS5（默认分词 0 命中，trigram 满 3 token 召回 29 行），JSON 查询走生成列（5000 行取 100 走 SEARCH，附 ALTER 加 STORED 被拒与 EXPLAIN 旧计划两坑）。两组实验 8 断言，并入选型表。"
publishedAt: "2026-09-20"
tags: ["数据库", "SQLite", "索引", "全文检索"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 本文由 FTS5 分词与 JSON 生成列两篇短文合并而成（原文 slug 已退役，实验与证据目录原样保留）。SQLite 里“查得快”有两个正交答案：文本查走 FTS5——默认分词器按空白切词，`MATCH '退款流程'` 0 行是预期行为，换 `tokenize='trigram'` 同召回 29 行且 bm25 可排序，但查询须满 3 token（“退款”2 字仍 0 行）；JSON 查走生成列——`GENERATED ALWAYS AS (json_extract(body,'$.sku')) STORED` 建索引后 5000 行取 100 走 `SEARCH ... USING INDEX`。两组实验 8 断言全过（4+4）。选型一句话：查**词**用 FTS5，查**字段**用生成列，两者可共存一张逻辑表之外（FTS5 是外联 content 表，见下）。

## 一、形态一：FTS5 中文两坑

| 分词器 | 中文 | 英文前缀 | 代价 |
| --- | --- | --- | --- |
| 默认 | 0 命中（按词切） | `refun*` 可用 | 无 |
| trigram | 满 3 token 可用 | 可用 | 索引膨胀（每 3-gram 一条） |
| icu/pinyin | 另装扩展 | — | 部署复杂度 |

T0 的 0 行是故意锁定的“预期行为”——防止后人当 bug 修。

## 二、形态二：JSON 生成列三判定

| 写法 | 计划 | 代价 |
| --- | --- | --- |
| 生成列 + 索引 | SEARCH | 写放大（每次写入算表达式） |
| 直接 `json_extract` 查 | SCAN | 读放大 |
| ALTER 加 STORED | 被拒 | 建表时声明，或 VIRTUAL（另测） |

两个实测坑：`ALTER TABLE` 加 STORED 生成列直接被拒（建表时声明）；删索引后同文本 `EXPLAIN` 仍返回旧计划（换查询文本才见新计划——验证计划时别复用同一句话）。加固 J4：`ALTER` 加 VIRTUAL 列同样可建索引（STORED 的建表限制不适用于 VIRTUAL）——两类生成列的行为差要分开记。

## 三、选型：词 vs 字段

```sql
-- 全文：外联 content 表，查询走 FTS5（示例形态，tokenize 按需换 trigram）
CREATE VIRTUAL TABLE docs_fts USING fts5(title, body, content='docs', content_rowid='id');

-- 字段：生成列 + 普通索引，查询走 SEARCH
CREATE TABLE docs(
  id INTEGER PRIMARY KEY,
  body TEXT,
  sku TEXT GENERATED ALWAYS AS (json_extract(body, '$.sku')) STORED
);
CREATE INDEX idx_docs_sku ON docs(sku);
```

FTS5 虚拟表不能直接加生成列——实践中是“一逻辑表、两物理形态”：原表管字段索引，外联 FTS5 表管全文，`content=` 参数保持同步。写入同时付两份索引税，读时按查询形态二选一。

## 四、实测

- FTS：`experiments/sqlite-fts/fts.py`（200 文档，外联 content 表 + rebuild），`evidence/sqlite-fts-tokenizer/2026-09-14-local/run.out`，4 PASS。
- JSON：`experiments/sqlite-json-index/jsonidx.py`（5000 行，外联生成列），`evidence/sqlite-json-index/2026-09-14-local/run.out`，4 PASS。

## 五、证据卡与边界

环境 Python 3.12 自带 SQLite。不支持：索引体积对比、生产查询延迟、拼音/ICU 扩展、写放大实测、VIRTUAL 列生产分布、生产数据分布。

## 参考资料

- SQLite 官方：FTS5 分词器与表结构，<https://www.sqlite.org/fts5.html>、<https://www.sqlite.org/fts5.html#fts5_tables>；生成列，<https://www.sqlite.org/gencol.html>；JSON1，<https://www.sqlite.org/json1.html>（2026-09-14 核对，合并篇复核 2026-09-20）
