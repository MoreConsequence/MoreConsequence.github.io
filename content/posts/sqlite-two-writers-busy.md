---
title: "SQLite 不给你排队：两个连接同时写，输家在 0.4ms 内收到失败"
description: "node:sqlite 双连接实测：写-写冲突立刻 BUSY（0.38ms），busy_timeout 只是重试预算（等满 224ms 照样失败）；WAL 改变读写关系但不改变写写互斥。"
publishedAt: "2026-08-23"
tags: ["SQLite", "数据库", "并发", "Node.js"]
draft: true
featured: false
series: "数据库原理手记"
---

**TL;DR：** 把 MySQL 的锁直觉搬到 SQLite 会翻车。用 `node:sqlite` 双连接实测（`experiments/sqlite-concurrency/`）：A 持写锁时 B 尝试写入，**0.38ms 内直接返回 `database is locked`**——不是排队等待；`busy_timeout=200` 给了耐心，结果也是等满 **224.39ms** 后同样失败。WAL 模式改变的是读写关系（写进行中读者以快照照常读，0.06ms 返回且看不到未提交行），写-写互斥在哪种模式下都一样。结论：SQLite 的 BUSY 不是死锁也不是排队，是"现在不行"的即时裁决——应用层必须把重试当正常路径来设计。

## 一、从 MySQL 直觉到 SQLite 现实

在 MySQL/Postgres 里，两个事务写同一行，后到者会**排队**等行锁，等到 `innodb_lock_wait_timeout` 才放弃。直觉迁移到 SQLite 就错了：SQLite 没有行级锁，它的并发单位是**整个数据库文件**（WAL 下精确到"写者独占 + 读者快照"）。第二个写者面对的不是"等你提交"，而是文件级的写锁判定——本机实测，这个判定在 **0.38ms** 内就给出了否决。

这个差异决定了错误处理的形态：MySQL 里锁等待是常态路径，SQLite 里 BUSY 是必须显式处理的返回值。

## 二、实验：三个场景的实测

两个连接打开同一个库文件，按确定顺序交错操作（同步驱动让"谁持锁"完全可控）：

| 场景 | 结果 | 实测耗时 |
| --- | --- | --- |
| S1 journal 模式：B 抢写（A 持锁） | `database is locked` | 0.38ms |
| S1 journal 模式：C 在 A 写入中读 | 读成功 | 0.09ms |
| S2 WAL：B 抢写（A 持锁） | `database is locked` | 0.07ms |
| S2 WAL：C 在 A 写入中读 | 读成功（2 行已提交快照） | 0.06ms |
| S3 WAL：B `busy_timeout=200` 且 A 不释放 | `database is locked` | **224.39ms** |

原始输出见 `evidence/sqlite-two-writers-busy/2026-08-23-local/run.log`。

## 三、BUSY 不是死锁：它是"现在不行"

三个容易被误读的地方：

1. **BUSY 是即时裁决，不是故障**。S1/S2 里 B 都在亚毫秒内拿到失败——这是 SQLite 在说"写锁此刻在别人手里"，语义上更接近 HTTP 429 而不是 500。正确的响应是退避重试，而不是报警；
2. **`busy_timeout` 是重试预算，不是队列位置**。S3 给了 B 200ms 耐心，SQLite 在这期间反复尝试拿锁，持锁方始终不放手，于是 B 在 224ms（配置值 + 驱动开销）后收到同样的 BUSY。它不保证成功，只保证"失败前多试一会儿"；
3. **它甚至不是死锁检测**。死锁是环状等待需要仲裁者打破；这里只有单向的资源占用，B 从头到尾没有持有任何 A 需要的东西。

顺带修正一个常见误解——实验里它也打了我自己的脸：我原本预期 journal 模式下"写入中的表不可读"，实测 S1 的读者照样成功。原因是 `BEGIN IMMEDIATE` 加的是 RESERVED 锁，允许共享读者继续；真正挡住读者的是提交瞬间的 EXCLUSIVE 升级。所以两种模式的差别比传言里小，真正的分水岭在下面。

## 四、WAL 改变读写关系，不改变写写互斥

对比 S1 与 S2 的读行为：journal 模式的读者读的是主库文件，遇到提交瞬间的 EXCLUSIVE 锁就要让路；WAL 模式下写发生在 `-wal` 文件、读者读主库快照，两者物理上不再竞争同一份页数据——实测读者在写进行中以 0.06ms 返回，且看到的恰好是 **2 行已提交内容**，未提交的第 3 行不可见。这就是"读写不互相阻塞"的确切含义。

但注意 S2 的第一行：**WAL 下第二个写者照样 0.07ms 被 BUSY 拒绝**。WAL 只有一份、写者仍然独占。"开了 WAL 就能并发写"是成本最高的误解之一；它能做的是让写不再拖累读。

## 五、边界

诚实声明四点：其一，同步驱动在同一线程内交错，"谁持锁"是确定的，这与多进程真实调度不同，但锁判定路径相同；其二，"持锁方中途提交、等待方随后成功"的路径无法在本线程内测量（同步 API 阻塞事件循环），该语义引用官方文档而非本机数据；其三，未测 checkpoint 时机与 WAL 文件增长；其四，版本绑定 Node v24.19.0 捆绑的 SQLite，升级可能改变误差量级但不改变方向。

## 六、结论：把 BUSY 当正常路径设计

1. 小事务、快进快出——持锁时间是你欠所有其他写者的债；
2. `busy_timeout` 设成略大于你的典型事务时长，然后**依然要处理失败分支**；
3. 重试用指数退避 + 抖动，别让 N 个被拒写者在同一毫秒再次相撞；
4. WAL 打开作为默认，但别指望它解决写-写冲突。

下一步可执行的事：在你的 SQLite 应用里搜一遍 `BEGIN`——每个事务的写段有多长？凡是能拆成"读在外面、写在最后"的，今天就拆。

## 参考资料

- 本篇实验与原始输出：`experiments/sqlite-concurrency/busy.mjs`、`evidence/sqlite-two-writers-busy/2026-08-23-local/`
- SQLite 官方文档：[Database Locking](https://www.sqlite.org/lockingv3.html)、[Write-Ahead Logging](https://www.sqlite.org/wal.html)、[busy_timeout](https://www.sqlite.org/pragma.html#pragma_busy_timeout)
- Node.js：[node:sqlite 稳定文档](https://nodejs.org/api/sqlite.html)
- 站内相关：[Redis 持久化](/writing/redis-persistence-rdb-aof)、[乐观锁与悲观锁](/writing/optimistic-vs-pessimistic-lock)
