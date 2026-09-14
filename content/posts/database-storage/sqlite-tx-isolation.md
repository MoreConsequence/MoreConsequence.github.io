---
title: "SQLite 事务隔离两断言：读快照稳定，双写立即 BUSY"
description: "WAL 下读事务期间他方提交，旧读数 100 不变、提交后见 101；第二写者 BEGIN IMMEDIATE 在 RESERVED 锁下立即 BUSY 不排队。用标准库 sqlite3 双连接锁定，S4 隔离级别拼图的 SQLite 块。"
publishedAt: "2026-09-14"
tags: ["数据库", "SQLite", "事务", "隔离级别"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** SQLite（WAL）两条可验证语义：读事务内他方提交 100→101，旧读数保持 100、提交后才见 101；双写者第二方 `BEGIN IMMEDIATE` 立即 `BUSY`，不等不排队。3 断言全过。这是 S4 事务隔离拼图的 SQLite 块：MySQL 的 RR/RC 见旧文，SQLite 的答案是“读快照 + 写串行”。

## 一、合同

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 读 | 快照稳定（WAL 下读写不互锁） | 跨连接实时可见 | 长读事务及时提交 |
| 写 | 单写者；第二方立即 BUSY | 排队等待 | 写重试/串行化（busy_timeout 或队列） |
| autocommit | `isolation_level=None` 下单条即提交 | 显式事务语义 | 读写事务显式 BEGIN |

## 二、实测

`experiments/sqlite-tx-isolation/isolation.py`（双连接，临时库），`evidence/sqlite-tx-isolation/2026-09-14-local/run.out`，3 PASS。

## 三、证据卡与边界

环境 Python 3.12 自带 sqlite。不支持：并发写吞吐、WAL 检查点交互、生产锁等待。

## 参考资料

- SQLite 官方：事务与 WAL 并发，<https://www.sqlite.org/wal.html>、<https://www.sqlite.org/lang_transaction.html>（2026-09-14 核对）
- 前篇：MVCC 与隔离级别（MySQL 视角），`/writing/mvcc-isolation-snapshot`
