---
title: "SQLite WAL 机制与 Checkpoint 深度剖析：从帧写入到空间回收与长读饥饿"
description: "SQLite 启用 WAL（预写式日志）后实现了读写并发，但其存储模型发生了本质变化。本文系统剖析 -wal 与 -shm 文件的协作机制、四种 Checkpoint 触发策略、备份丢数据风险以及长事务导致的 WAL 无界膨胀。"
publishedAt: "2026-09-14"
updatedAt: "2026-10-21"
tags: ["数据库", "SQLite", "WAL", "存储引擎", "持久化"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 默认情况下 SQLite 采用回滚日志（Rollback Journal），读写互斥。切换至 `journal_mode = WAL` 后，SQLite 支持单写多读并发：写入操作直接以帧（Frame）形式追加到 `-wal` 日志中，读操作通过 `-shm` 共享内存索引合并读取主库与日志最新版本。在实测写入 2,000 行数据时，`-wal` 文件增长至 49,472 字节，而主文件保持不变。执行 `PRAGMA wal_checkpoint(TRUNCATE)` 后，帧数据被安全搬迁回主库，WAL 文件物理截断归零，行数无丢失。如果在备份时仅复制 `.db` 文件，将直接丢失 WAL 中的未归档数据。长生命周期的只读事务会钉死读取标记（Read Mark），导致 Checkpoint 无法推进，引发 WAL 文件无界膨胀与读放大。

## 一、从回滚日志到 WAL：读写互斥的破局

在传统的 Rollback Journal 模式下，写事务在修改页面前，必须先将旧页面完整复制到 journal 文件中。写入期间持有排他写锁（EXCLUSIVE），任何只读查询均被阻塞。读写无法并发是单体嵌入式数据库的主要痛点。

SQLite 3.7.0 引入的 WAL（Write-Ahead Logging）模式彻底反转了这一流程：
1. **写路径追加**：写事务直接将修改后的新页面以 WAL 帧（32 字节帧头 + 页面数据）的形式顺序追加到 `-wal` 文件尾部。主数据库文件（`.db`）在写入过程中完全不发生就地修改。
2. **读路径路由**：只读事务通过内存映射的 `-shm` 索引文件检索页面。若目标页面存在于 WAL 中，直接读取 WAL 里的最新帧；若未修改，则读取主数据库文件。读事务仅持有共享锁，读与写彻底解耦，互不阻塞。

```text
写操作流程:
  INSERT/UPDATE 事务提交
         │
         ▼
  [追加至 demo.db-wal 文件] ─── 同步更新 ───> [demo.db-shm 内存映射索引]
  (主文件 demo.db 保持原状)

读操作流程:
  SELECT 查询页面 P
         │
         ▼
  查询 demo.db-shm 索引
  ├── 若 P 在 WAL 中存在且未超过自身读标记 ──> 从 demo.db-wal 读取最新帧
  └── 若 P 不在 WAL 中 ─────────────────────> 从主文件 demo.db 读取原始页面
```

## 二、Checkpoint 检查点的物理机制

随着写入持续进行，`-wal` 文件会不断变长。Checkpoint（检查点）的职责是将 `-wal` 文件中已提交的页面帧逐一回写（Flush）覆盖到主数据库文件的对应位置，并重置 WAL 文件。

### 1. 四种 Checkpoint 模式与阻断语义

SQLite 提供了 `PRAGMA wal_checkpoint(MODE)` 命令，支持四种运行模式：

| 模式 | 运行行为 | 是否阻塞并发写入 | 是否截断文件 | 适用场景 |
| --- | --- | --- | --- | --- |
| `PASSIVE` | 尽力回写已提交帧，遇到活跃读者即停 | 否 | 否 | 默认后台自动检查点（满 1000 页触发） |
| `FULL` | 等待并发写入完成，回写全部有效帧 | 是（阻塞新写事务） | 否 | 业务写入批处理结束后的周期同步 |
| `RESTART` | 回写全部帧并强制将写入游标重置回第 1 帧 | 是 | 否 | 准备进入下一轮高效循环覆写 |
| `TRUNCATE` | 回写全部帧，重置游标，并截断 WAL 为 0 字节 | 是 | 是（文件归零） | 物理冷备份前夕、磁盘空间紧急回收 |

在 Python 测试中，写入 2,000 行记录后，调用 `con.execute("PRAGMA wal_checkpoint(TRUNCATE)")`，返回状态 `(0, total_frames, checkpointed_frames)`。首位 `0` 确认当前无活跃并发读写阻塞，`-wal` 文件从 49,472 字节瞬间被物理截断归零。

## 三、长读事务饥饿（Checkpoint Starvation）陷阱

WAL 模式最常被忽视的运维隐患是长读事务导致的磁盘暴涨。

### 1. 读取标记（Read Mark）机制

为了实现快照隔离级别（Snapshot Isolation），每个只读事务在开启的一瞬间，会在 `-shm` 文件中注册一个 `Read Mark`。该标记记录了当前事务开启瞬间 WAL 文件中包含的最大帧编号（例如帧 500）。
该只读事务在整个生命周期内，只能读取编号小于等于 500 的帧，对后续新写入的帧视而不见。

### 2. 检查点推进被钉死

Checkpoint 进程只能安全回写所有活跃读者都不再依赖的历史帧：

\[
\text{Max Checkpoint Frame} \le \min(\text{Active Read Marks})
\]

若系统内存在一个慢查询或者未显式提交的只读事务（例如在后台执行复杂统计，持续耗时 10 分钟）：
- 其注册的 `Read Mark = 500`。
- 期间主线程持续写入，WAL 帧追加到了 10,000。
- 此时执行的任何 Checkpoint 只能推进到帧 500，无法进一步向前回写。
- 后续的新写入只能不断向后追加，无法从头循环覆写。

结果导致 `-wal` 文件在几十分钟内从几兆字节暴涨至数十吉字节。更为严重的是，由于 `-shm` 索引体积膨胀，后续所有的只读查询在查找页面时都需要跨越成千上万个哈希桶，引发全局读延迟大幅飙升。

## 四、生产级备份与数据安全准则

WAL 模式的存储结构决定了备份操作不能简单依赖文件系统拷贝。

### 1. 裸拷 `.db` 导致的数据静默丢失

许多自动化运维脚本直接调用 `cp app.db /backup/app.db`。
在 WAL 模式下，最近的所有增删改操作全都滞留在 `app.db-wal` 文件中，尚未刷入主数据库文件。如果只拷贝 `.db` 文件，还原时会发现所有近期修改全部消失。

### 2. 标准的两种热备方案

正确的热备份有以下两条路径：
- **方案一：使用 SQLite 原生在线备份 API**。调用 C 接口 `sqlite3_backup_init()` 或 Python 的 `bck = con.backup(dest_con)`。该 API 能在底层协同 WAL 与主文件，在完全不锁写操作的前提下生成一致性快照。
- **方案二：Checkpoint + 三文件原子打包**。在冷备份前，显式执行 `PRAGMA wal_checkpoint(TRUNCATE)` 将数据强制并入主库；若无法截断，必须将 `app.db`、`app.db-wal` 和 `app.db-shm` 三个文件整体打包备份。

## 五、验证实验与数据闭环

本机制在 `experiments/sqlite-wal/wal.py` 中基于 Python 3.12 与 SQLite 进行了实测断言：
- 断言 W1：批量插入 2,000 条记录后，WAL 文件确定性生成并增长至 49,472 字节。
- 断言 W2：执行 `wal_checkpoint(TRUNCATE)` 成功，状态码为 0，WAL 文件大小严格降为 0 字节。
- 断言 W3：在文件截断后执行全表扫描，数据总量严格恒等于 2,000 行，证明未丢失任何已提交记录。

## 参考资料

- SQLite Official Documentation: Write-Ahead Logging (<https://www.sqlite.org/wal.html>)
- SQLite WAL Frame Format Specifications (<https://www.sqlite.org/walformat.html>)
- SQLite Backup API Guide (<https://www.sqlite.org/backup.html>)
- 站内对照：SQLite 双写者 BUSY 机制深度解析，`/writing/sqlite-two-writers-busy`
- 架构演进：SQLite 索引形态（FTS5 全文 vs JSON 生成列），`/writing/sqlite-index-two-shapes`
