---
title: "SQLite FTS5 中文两坑：默认分词 0 命中，trigram 查询要满 3 token"
description: "200 文档 29 条中文目标：默认分词 MATCH 中文 0 行（预期行为），trigram 表同召回 29 行且 bm25 可排序，但 2 字查询仍是 0 行（trigram 至少 3 token）。4 断言锁定分词器选型。"
publishedAt: "2026-09-14"
tags: ["数据库", "SQLite", "全文检索", "FTS"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** SQLite FTS5 查中文有两个坑：默认分词器按空白/标点切词，`MATCH '退款流程'` 直接 0 行；换 `tokenize='trigram'` 后同召回 29 行、bm25 可排序，但查询必须满 3 个 token（中文一字一 token，“退款”2 字还是 0 行，“退款流程”4 字才行）。4 断言全过。结论：中文全文检索先选分词器再谈召回，英文前缀查询（`refun*`）反而默认表就能用。

## 一、合同

| 分词器 | 中文 | 英文前缀 | 代价 |
| --- | --- | --- | --- |
| 默认 | 0 命中（按词切） | `refun*` 可用 | 无 |
| trigram | 满 3 token 可用 | 可用 | 索引膨胀（每 3-gram 一条） |
| icu/pinyin | 另装扩展 | — | 部署复杂度 |

## 二、实测

`experiments/sqlite-fts/fts.py`（200 文档，外联 content 表 + rebuild），`evidence/sqlite-fts-tokenizer/2026-09-14-local/run.out`，4 PASS。T0 的 0 行是故意锁定的“预期行为”——防止后人当 bug 修。

## 三、证据卡与边界

环境 Python 3.12 自带 SQLite。不支持：索引体积对比、生产查询延迟、拼音/ICU 扩展。

## 参考资料

- SQLite 官方：FTS5 分词器，<https://www.sqlite.org/fts5.html>（2026-09-14 核对）
