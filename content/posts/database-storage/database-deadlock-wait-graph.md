---
title: "死锁不是靠重试：wait-for graph 与间隙锁"
description: "死锁是锁等待图成环后的确定性结果：InnoDB 检测器负责尽快破环，innodb_lock_wait_timeout 只是单锁等待的兜底。本文区分普通一致性读、锁定读、UPDATE/INSERT 的间隙锁，给出双会话复现与重试边界。"
publishedAt: "2026-08-06"
updatedAt: "2026-08-17"
tags: ["MySQL", "数据库", "事务", "并发"]
draft: false
featured: false
series: "数据库原理手记"
---

**TL;DR：** 死锁不是“偶尔撞上的运气”，是**锁等待关系成环**的确定性后果——只要两个事务各持有一把对方要的锁，当前调度下就无法推进。MySQL 用 wait-for graph 主动检测，发现环就回滚一个受害事务并返回 `ER_LOCK_DEADLOCK`；`innodb_lock_wait_timeout` 处理的是单笔锁等待超时，不是死锁检测器。RR 下的 next-key/gap lock 会让范围写入和插入意图锁进入等待图，但普通一致性读、锁定读和写语句的锁语义不能混为一谈。本文拆开锁模型与两个双会话复现。


---

![InnoDB 间隙锁互锁与 Wait-for Graph 死锁检测有向图](../../../public/images/mysql-deadlock-wait-for-graph.svg)

## 一、死锁的物理真相：等待图里出现环

一个事务要么拿到锁继续，要么拿到锁等别人；"别人"也可能在等你。这一张"持有/等待"关系图就是 **wait-for graph**。死锁的定义极其机械：**图里出现环**。

```
事务 A: 持有 lock_X(行1) → 等待 lock_Y(行2)
事务 B: 持有 lock_X(行2) → 等待 lock_Y(行1)
```

因为环上没有出路的节点，任何调度都无法推进——它不是概率，是两个事务按固定顺序抢锁的**必然结局**。这也是为什么死锁复现几乎必现：只要让 A 先锁行 1 再锁行 2、B 先锁行 2 再锁行 1，第一次执行就成环；反过来（两者同序）却永远不死——"环"才是死锁的充分条件。

## 二、检测器 vs 超时：谁先动手

MySQL 对付环有两条防线：

| 机制 | 触发 | 特点 |
| :--- | :--- | :--- |
| **wait-for graph 检测器** | 等待图成环时**立即**回滚"回滚代价最小"的事务 | 快、准；用已修改行数估算回滚成本 |
| `innodb_lock_wait_timeout`（默认 50s） | 单事务等待单把锁超过该秒数 | 兜底：报 `ER_LOCK_WAIT_TIMEOUT`，被等待方仍活着 |

关键认知：**死锁靠检测器，超时是"检测器没认出环"时的逃生通道**。所以当你看到 `Deadlock found when trying to get lock; try restarting transaction`，说明引擎已经：检测到环 → 选择回滚代价最小的事务 → 你已经站在这个环里成了"被牺牲"的一方。**它是从你的角度说的，不是引擎放弃了**。

受害者选择不是随机：InnoDB 倾向于回滚**已修改行更少**的事务（估算回滚成本）。因此"短事务 + 每行一次 UPDATE"的写法，比"长事务 + 批量更新"更不易被牺牲——这正是"让事务短"的工程核点之一。

## 三、间隙锁：为什么范围写入会把插入也拉进等待图

MVCC（见上一篇）让普通一致性读可以从快照读历史版本，但 **`UPDATE ... WHERE`、`DELETE ... WHERE`、`SELECT ... FOR UPDATE` 与 `INSERT` 在 RR 下可能进入 next-key/gap lock 语义**。间隙锁锁的是“索引上两个值之间的空隙”，防止其他事务向区间内插入。于是范围修改和插入意图锁会一起进入等待图；这不是“所有只读 SELECT 都加 gap lock”。

**典型的“范围锁型死锁”**

```sql
-- SESSION 1
START TRANSACTION;
UPDATE acc SET fee=0 WHERE balance BETWEEN 100 AND 200;  -- 间隙锁了 (100,200)

-- SESSION 2
START TRANSACTION;
INSERT INTO acc VALUES (150, 50);   -- 想插进 (100,200) → 等 S1 的 gap lock
```

此时只有 S1 持锁、S2 等待，没有环。环是**双方都在锁同一片区间**才形成的：

```sql
-- 更严格的复现：间隙锁 + 插入意图锁成环
-- S1
UPDATE t SET c=c+1 WHERE id BETWEEN 5 AND 10;   -- 行 5-10 + 间隙 (5,10)
-- S2
UPDATE t SET c=c+1 WHERE id BETWEEN 15 AND 20;  -- 行 15-20 + 间隙 (15,20)
-- S1 现在想插到 15~20 的间隙
INSERT INTO t VALUES(16);                        -- 等 S2 的 gap lock
-- S2 现在想插到 5~10 的间隙
INSERT INTO t VALUES(6);                         -- 等 S1 的 gap lock → 环形成
-- 结果: ERROR 1213 (40001): Deadlock found
```

结果：`ERROR 1213 (40001): Deadlock found`。这里的重点是 **S1/S2 的范围修改先持有了不同区间的 next-key/gap lock，后续 INSERT 再通过插入意图锁互相等待**。如果把语句换成普通一致性 `SELECT`，它通常读取快照而不按这个路径持有 gap lock；如果是 `SELECT ... FOR UPDATE`，则又回到锁定读语义，必须按索引和隔离级别重新分析。



![InnoDB 锁范围拓扑：Record Lock、Gap Lock 与 Next-Key Lock 判定](../../../public/images/innodb-gap-next-key-lock-scope.svg)

## 四、复现与救援站：把死锁训练出来

最可靠的学习方式，是让死锁在可控环境里发生两次：

```bash
# 在 disposable MySQL 8.0/InnoDB 实例中先准备表；本文没有保存该实例的 raw。
mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS deadlock_lab;
USE deadlock_lab;
CREATE TABLE IF NOT EXISTS employees (
  id INT PRIMARY KEY,
  salary INT NOT NULL
) ENGINE=InnoDB;
INSERT INTO employees (id, salary) VALUES (1, 1000), (2, 2000)
  ON DUPLICATE KEY UPDATE salary = VALUES(salary);
SQL

# 打开 deadlock 监测（只影响后续测试实例）
SET GLOBAL innodb_lock_wait_timeout = 5;   # 先调小，便于观察兜底路径

# 会话 1                                # 会话 2
BEGIN;
UPDATE employees SET salary=3000 WHERE id=1;
                                         BEGIN;
                                         UPDATE employees SET salary=4000 WHERE id=2;
UPDATE employees SET salary=5000 WHERE id=2;  -- 等 2 的锁
                                         UPDATE employees SET salary=6000 WHERE id=1;  -- 等 1 → 环形成
                                         # ERROR 1213 Deadlock 出现在其中一个会话
```

观测工具：`SHOW ENGINE INNODB STATUS` 的 `LATEST DETECTED DEADLOCK` 段落会打印死锁时的事务、持有/等待的锁以及被回滚的 victim。把这段输出和两会话的 SQL、索引定义、隔离级别一起留下来，才足以解释“环在哪里形成”。

```mermaid
flowchart LR
    A["事务 A<br/>持: lock(id=1)<br/>等: lock(id=2)"] -->|"等待"| B["事务 B<br/>持: lock(id=2)<br/>等: lock(id=1)"]
    B -. " 环 !" .-> A
    D["InnoDB 检测器<br/>wait-for graph 发现环"] -->|"立即回滚 A(代价小)"| A
```

## 五、写代码怎么躲：死锁是设计出来的，也能被设计没了

检测器替你收款，但**好代码让环不出现**。从工程上排除死锁的四条铁律：

1. **固定锁顺序**。所有事务按同一顺序触碰资源（id 升序），环就没有结构条件。
2. **一个事务只写"一把"核心资源**。能分担的事务拆成多个，锁持有面收窄，碰撞面自然小。
3. **能 `SELECT ... FOR UPDATE` 一次锁够就锁够**，避免先查后改造成"两次锁窗口"。
4. **接受死锁并把它设计成可重试短事务**。既然检测器保证"总有一个被回滚"，短事务重试的成本就是最小化了的——**不是靠运气，是接受算法**与它做朋友。

## 六、结论：先画等待图，再谈重试

死锁 = 锁等待图成环，是并发写顺序决定的**确定性事件**。InnoDB 用 wait-for graph 检测器保证"环必被打破"（回滚一个），超时只是兜底。RR 下间隙锁让只读范围查询也能成为锁参与者，所以**死锁排查不只在写写冲突里**。工程上的解法从来不是写更长超时，而是固定锁顺序 + 短事务 + 优雅重试。

下一步：跑一遍第一组复现，然后把这套"wait-for graph + 间隙锁"的心智搬回你生产里最近一条死锁日志——多数情况下你会发现当时随手的原因（锁顺序、或一个缺口漏锁），比你想的更清楚。

## 参考资料

1. InnoDB 官方文档：死锁检测与回滚受害者—— https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks.html
2. InnoDB 官方文档：事务锁类型（gap lock / next-key lock）—— https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html
3. InnoDB 官方文档：innodb_lock_wait_timeout—— https://dev.mysql.com/doc/refman/8.0/en/innodb-parameters.html#sysvar_innodb_lock_wait_timeout
4. MySQL 参考手册：SHOW ENGINE INNODB STATUS—— https://dev.mysql.com/doc/refman/8.0/en/show-engine.html

> 延伸阅读：死锁里的"锁"在事务的正确性模型里只负责写的顺序，读的先后由版本链与快照决定，见[事务隔离不是原子的：MVCC 的版本链与快照账本](/writing/mvcc-isolation-snapshot)；把事务做长时还欠 WAL 一笔账，见[数据库为什么宁可慢，也要等你 fsync](/writing/fsync-group-commit)；单实例死锁在分布式环境升级成"资源不释放"的悬挂，见[分布式事务：2PC 为什么没人敢用](/writing/distributed-transactions-2pc-saga)。
