# evidence/sqlite-two-writers-busy/2026-08-23-local

SQLite 双连接并发行为实测（node:sqlite 内置驱动）。

## 环境

- darwin/arm64，Node v24.19.0（node:sqlite 内置），SQLite 经 Node 24.19 发行版捆绑
- 工具：`experiments/sqlite-concurrency/busy.mjs`（临时库目录，跑完即删）

## 运行命令

```sh
node experiments/sqlite-concurrency/busy.mjs
```

## 原始输出要点（run.log）

- S1 journal(delete) 模式：B 抢写失败 `database is locked`，**0.38ms** 返回；
  同一时刻 C 读成功——RESERVED 写锁不阻塞读。
- S2 WAL 模式：B 抢写同样立刻 BUSY（0.07ms）；C 读成功且读到 **2 行已提交快照**
  （未提交的第 3 行不可见，验证快照隔离）。
- S3 `busy_timeout=200` 且持锁方不释放：B 等满 **224.39ms** 后同样 BUSY 失败。

## 边界

- 同步驱动在同一线程内按显式顺序交错，"谁持锁"是确定的；这不同于多线程/多进程的真实调度，
  但锁判定逻辑相同；
- 未覆盖：A 先占锁、稍后提交而 B 在等待中成功的路径（同步 API 无法在本线程内并发提交），
  该语义引用 SQLite 文档而非本机测量；
- 无 checkpoint/wal 大小调优内容。
