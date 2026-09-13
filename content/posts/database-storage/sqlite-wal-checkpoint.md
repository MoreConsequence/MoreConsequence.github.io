---
title: "SQLite WAL checkpoint：49KB 先长后消，2000 行不少一行"
description: "journal_mode=WAL 下 2000 行写入让 -wal 长到 49KB，TRUNCATE checkpoint 后归零且 count 仍为 2000。用标准库 sqlite3 锁定，并说明备份读 -wal 与 checkpoint 时机的关系。"
publishedAt: "2026-09-14"
tags: ["数据库", "SQLite", "WAL", "存储"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** SQLite 切 WAL 后写入先进 `-wal` 文件：2000 行写入让它长到 49,472B，`wal_checkpoint(TRUNCATE)` 后归零，表内 2000 行不少一行。3 断言全过（Python 3.12 + SQLite 3.53.1）。含义：备份只拷 `.db` 会丢 WAL 里的数据；checkpoint 不是“优化项”，是备份与空间回收的前置条件。

## 一、完整路径：一行写入去哪了

```text
INSERT → 先 append 到 -wal（读合并 -wal + db）
  → checkpoint：-wal 内容回写 db 主文件
  → TRUNCATE：-wal 截断归零
```

读放大与写放大的分界线就在 checkpoint：checkpoint 前读要合并两处，checkpoint 后读只走主文件。

## 二、合同

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 持久性 | commit 即落 -wal | 主文件即时更新 | 备份拷 `-wal` + `-shm` 或先 checkpoint |
| 空间 | TRUNCATE 回收 | 自动 checkpoint 及时（默认 1000 页才触发） | 大批量写入后手动 checkpoint |
| 并发 | 一写多读 | 多写（仍串行，BUSY 见旧文） | 写串行化设计 |

## 三、实测

`experiments/sqlite-wal/wal.py`，`evidence/sqlite-wal-checkpoint/2026-09-14-local/run.out`：W1 49,472B、W2 归零（返回首项 busy=0 表示未被阻塞完成）、W3 count=2000，3 PASS。

## 四、证据卡与边界

环境 Darwin arm64 + Python 3.12.9 自带 sqlite。不支持：并发写竞争（见 `sqlite-two-writers-busy`）、生产备份窗口、WAL 性能对比。

## 参考资料

- SQLite 官方：WAL 模式与 checkpoint，<https://www.sqlite.org/wal.html>（2026-09-14 核对）
- 前篇：SQLite 双写者 BUSY，`/writing/sqlite-two-writers-busy`
