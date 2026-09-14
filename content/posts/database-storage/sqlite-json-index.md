---
title: "SQLite JSON 生成列索引：SEARCH 走索引，外加两个建表坑"
description: "json_extract 生成列 + 索引让 sku 查询走 SEARCH（5000 行取 100），另记 ALTER 加 STORED 列被拒与同文本 EXPLAIN 返回旧计划两个坑。用 3 断言锁定。"
publishedAt: "2026-09-14"
tags: ["数据库", "SQLite", "JSON", "索引"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** JSON 存 TEXT 照样能索引：`GENERATED ALWAYS AS (json_extract(body,'$.sku')) STORED` 加生成列再建索引，5000 行里取 100 行走 `SEARCH ... USING INDEX`。3 断言全过。附赠两个实测坑：`ALTER TABLE` 加 STORED 生成列直接被拒（建表时声明）；删索引后同文本 `EXPLAIN` 仍返回旧计划（换查询文本才见新计划——验证计划时别复用同一句话）。

## 一、合同

| 写法 | 计划 | 代价 |
| --- | --- | --- |
| 生成列 + 索引 | SEARCH | 写放大（每次写入算表达式） |
| 直接 `json_extract` 查 | SCAN | 读放大 |
| ALTER 加 STORED | 被拒 | 建表时声明，或 VIRTUAL（另测） |

## 二、实测

`experiments/sqlite-json-index/jsonidx.py`（5000 行，外联生成列），`evidence/sqlite-json-index/2026-09-14-local/run.out`，3 PASS。

## 三、证据卡与边界

环境 Python 3.12 自带 SQLite。不支持：写放大实测、VIRTUAL 列、生产数据分布。

## 参考资料

- SQLite 官方：生成列、JSON1，<https://www.sqlite.org/gencol.html>、<https://www.sqlite.org/json1.html>（2026-09-14 核对）
