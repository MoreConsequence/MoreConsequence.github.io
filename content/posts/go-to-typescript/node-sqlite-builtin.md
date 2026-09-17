---
title: "Node 内置 sqlite：参数化、具名参数、显式事务三断言"
description: "node:sqlite 零依赖可用：参数化写入挡住注入串、具名参数读整行对象、显式 BEGIN/ROLLBACK 原子回滚。用 3 断言锁定，并说明无 transaction 助手与 better-sqlite3 的取舍。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-16"
tags: ["Node.js", "SQLite", "数据库", "TypeScript"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** Node v24 自带 `node:sqlite`（同步 API，零依赖）：`x'); DROP TABLE` 当纯文本存入（count=2 无损）、具名参数返回整行对象、显式 `BEGIN`/`ROLLBACK` 后 count 回退。3 断言全过。与 better-sqlite3 的差别不在功能在形态：本模块**没有** `transaction()` 助手，事务自己写 BEGIN/COMMIT——少一层魔法，多一行样板。

## 一、合同

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 注入 | 参数化后注入串无害 | 拼接 SQL 安全（照样注入） | 全参数化，DDL 也不拼接 |
| 事务 | 显式 BEGIN/COMMIT/ROLLBACK | 自动重试 BUSY | 并发写策略（见 SQLite 双写者篇） |
| API | 同步，简单可推理 | 高并发吞吐（单连接串行） | 连接池/队列另起 |

## 二、实测

`experiments/node-sqlite/demo.mjs`，`evidence/node-sqlite/2026-09-14-local/run.out`，5 PASS。加固 Q4：文件库 `journal_mode=WAL` 可开，内存库返回 `memory`（不支持 WAL 是预期行为）——要并发读写先落文件库。另记：`db.transaction` 不存在——从 better-sqlite3 过来的人第一次一定会写错，本文即证据。

## 三、证据卡与边界

环境 Node v24.19.0。不支持：WAL/并发（见 Python 版 SQLite 篇）、生产性能对比。

## 参考资料

- Node.js 文档：node:sqlite，<https://nodejs.org/api/sqlite.html>（2026-09-14 核对）
- 前篇：SQLite 双写者 BUSY，`/writing/sqlite-two-writers-busy`
