---
title: "翻页用 cursor 不用 offset：并发写入下 offset 重 2 行"
description: "DESC 翻页中途写入 2 行更新的：offset 第二页与第一页重叠 [16,17]，cursor（WHERE ts < 上页末位）无重行且差 1 衔接。用 SQLite 双写对照锁定，并说明总数抖动与删行空洞的剩余边界。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-16"
tags: ["API 设计", "分页", "SQLite", "系统设计"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 按时间倒序翻页、每页 5 行，中途写入 2 行更新的：offset 第二页与第一页重叠 `[16, 17]`（10 个槽位只拿到 8 行 distinct）；cursor（`WHERE ts < 上页末位`）无重行、末位 18→17 差 1 衔接。3 断言全过。结论：feed 类列表默认 cursor；offset 只留给“总数稳定且允许跳页”的后台管理端。

## 一、合同

| 维度 | offset | cursor |
| --- | --- | --- |
| 保证 | 任意跳页 | 写入下无重无漏（增行场景） |
| 不保证 | 写入下不重（实测重 2） | 跳页、总数稳定、删行无洞 |
| 调用者负责 | 管理端 + 低频 | cursor 字段单调（ts/自增 id）、排序稳定（末位 tie-break） |

## 二、实测

```sql
-- cursor 形状（experiments/cursor-pagination/pages.py）：末位做门，不用 OFFSET
SELECT ts FROM feed WHERE ts < ? ORDER BY ts DESC LIMIT 5;
```

`experiments/cursor-pagination/pages.py`，`evidence/cursor-pagination/2026-09-14-local/run.out`，4 PASS。加固 O4：删掉中间 2 行，cursor 不报错不断裂、只是跳过（`[9,8,7,6,5]`）——cursor 保证“无重”，不保证“无洞”，删行空洞由业务接受或回填。O1 的 `p1=[20..16] p2=[17..13]` 是全文关键：重的不只是“某行”，而是每写入 N 行就重 N 行——写入越频繁，offset 越接近“永远翻不完”。

## 三、证据卡与边界

环境 Python 3.12 自带 sqlite。不支持：删行空洞、大 offset 性能（另起索引篇）、分布式多分片合并。

## 参考资料

- GitHub REST 分页（cursor/before-after 的生产形态），<https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api>
- 前篇：API 形状与幂等（列表契约上下文），`/writing/service-api-shape`；webhook 去重（翻页与重投的共同敌人），`/writing/service-webhook-hmac`
