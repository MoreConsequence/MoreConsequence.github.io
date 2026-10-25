---
title: "PostgreSQL 19 延期发布的工程启示：核心特性 Revert 溯源与数据库发布工程学"
description: "PostgreSQL 19 在 Beta 后期连续 Revert 了 GROUP BY ALL、分区拆分合并与 SQL/PGQ 三大明星特性并将 GA 推迟。本文深度复盘 PostgreSQL 严苛的提交节（Commitfest）质量治理逻辑与生产升级防火清单。"
publishedAt: "2026-09-19"
updatedAt: "2026-10-22"
tags: ["PostgreSQL", "数据库", "发布工程", "版本演进", "架构设计"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 基础软件的成熟度不在于塞进了多少未经验证的野心特性，而在于敢于在发布前夕坚决回滚（Revert）存在设计隐患的半成品。PostgreSQL 19 原定 9 月底 GA，但由于在 Beta 测试后期累计发生了 53 次回滚，官方将正式版推迟至 10 月底。三大备受瞩目的重磅功能遭遇下马：`GROUP BY ALL` 因在非默认排序相等语义下存在计算错误被撤下；历经两代演进的 `MERGE/SPLIT PARTITION` 分区动态重组因深层死锁与并发设计缺陷再次被整体 Revert；`SQL/PGQ` 原生图查询则因执行器成熟度不足推迟至 PG 20。生产团队的应对策略极为清晰：立刻暂停基于 19 特性的技术重构，坚守稳定的 18.x 分支，并在跨大版本升级前严格过一遍内核防火清单。

## 一、开源数据库治理的典范：Revert 是质量红线而非失败

在消费级互联网软件中，“敏捷开发、快速试错、线上修 Bug”是常态。
但在数据库领域，任何一个数据损坏（Data Corruption）或并发脏读的 Bug，都会导致跨国企业的核心账本瘫痪，造成不可逆的巨额损失。

PostgreSQL 社区遵循严格的 Commitfest（提交节）与审查制度：
代码在合并入分支后，会在遍布全球不同硬件、不同操作系统和编译器矩阵的自动化构建农场（Buildfarm）上接受长达数月的持续压力测试。
当 Beta 阶段接近尾声时，社区的准入标准呈指数级收紧。核心团队宁可顶着“跳票”的舆论压力大刀阔斧削减 Scope，也绝不把带有设计债务的半成品打包进 GA 正式版。
这种严苛克制的发布工程学，正是 PostgreSQL 历经 30 年依然被誉为业界最稳固关系型数据库的根本原因。

## 二、被砍掉的三大重磅特性深度技术复盘

在 PostgreSQL 19 的 Beta 演进中，三大功能的 Revert 揭示了复杂的存储引擎与执行器权衡。

```text
PostgreSQL 19 明星特性回滚轨迹:
  ├── 1. GROUP BY ALL (Commit a32733d)
  │      └── 根因: ORDER BY 非默认相等语义下产生错误计算结果，后期重构代码扰动过大 -> 撤回至 PG 20
  │
  ├── 2. MERGE / SPLIT PARTITION (08-27 全量回滚)
  │      └── 根因: 动态重组分区时并发事务持有锁降级漏洞，极易发生全表死锁 -> 继 PG 17 后第二次被砍
  │
  └── 3. SQL/PGQ 原生图查询
         └── 根因: 图遍历算子在复杂连接下的成本估算器 (Cost Planner) 缺乏成熟统计模型 -> 推迟孵化
```

### 1. `GROUP BY ALL`：简便语法背后的相等性语义地雷

`GROUP BY ALL` 旨在自动推断 `SELECT` 列表中所有非聚合列并自动将其加入分组，提升交互式分析效率。
但在后置提交审查（Post-commit Review）中，黑客团队发现：当查询包含自定义操作符类或非默认 Collation 时，`ORDER BY` 采用的排序比较器与 `GROUP BY` 内部的哈希相等性比较器会产生微妙的语义偏离。
在特定边界下，系统会返回完全错误的分组统计结果。
核心开发者的回滚理由直截了当：“Too much code churn for late beta”（在 Beta 晚期修改此类基础逻辑引入的代码扰动过大）。社区坚决将其剥离，推迟到 PG 20 重新设计。

### 2. `MERGE/SPLIT PARTITION`：并发重组分区的死锁与事务边界

在线拆分（Split）与合并（Merge）分区表是云原生数据库的刚需功能。用户期望在不阻塞业务写入的前提下，将一个大范围的按月分区动态拆分为两个按半月分区。
然而，在 PostgreSQL 内部，分区元数据变更需要获取 `AccessExclusiveLock`（排他锁）。
在实现动态拆分时，代码试图在数据搬迁阶段将锁降级为共享写锁以降低阻塞。但在高并发读写事务交叉到达时，这一锁降级机制破坏了现有的锁拓扑，导致严重的级联死锁，甚至偶发数据页面丢失。
这是该功能继 PostgreSQL 17 夭折后的第二次大回滚，印证了存储引擎底层元数据并发变更的极高难度。

### 3. `SQL/PGQ`：ISO 图查询标准的执行器挑战

SQL:2023 标准引入了属性图查询（PGQ）。PostgreSQL 原计划在 19 中提供原生图路径匹配语法。
但图遍历算子（如可变长度路径搜索）在复杂关系网下的基数估计（Cardinality Estimation）极度困难。缺少准确的代价模型，优化器极易选错执行路径，将一个毫秒级的查询退化为跑满 CPU 数小时的全表笛卡尔积。社区最终决定将其延后，避免将未成熟的优化器暴露在生产环境。

## 三、生产数据库的升级防火清单（Firewall Checklist）

即使 PostgreSQL 19 正式发布，生产环境升级也不应盲目推进。数据库团队必须逐项核对升级防火墙：

1. **JIT 编译默认关闭**：对于常规 OLTP 高并发短查询，LLVM JIT 动态编译的时间往往超过查询执行本身，生产环境必须显式设置 `jit = off`。
2. **字符转义强制锁死**：必须确认全局配置 `standard_conforming_strings = on`，防止老旧驱动拼接转义斜杠引发 SQL 注入。
3. **RADIUS 模块彻底移除**：PostgreSQL 19 正式移除了内置的旧版 RADIUS 身份验证模块，依赖该认证的集群必须提前迁移至 LDAP 或 SCRAM-SHA-256。
4. **MD5 密码登录拦截**：过时的 MD5 算法被全面标记为废弃，升级前必须在日志中排查是否还有应用在使用弱密码哈希。
5. **版本守成策略**：大版本升级严格遵循“守 N-1”原则。在 PostgreSQL 19.1 或 19.2 次版本（包含第一波生产 Bug 修复）发布之前，核心交易系统一律坚守成熟的 18.x 稳定分支。

## 四、验证实验与边界说明

- 一手来源：PostgreSQL 官方邮件组（pgsql-hackers）、官方 19 Open Items 跟踪页面与 commit `a32733d` 回滚日志（2026-09-19 核对）。
- 边界说明：本文属于数据库架构与发布工程学深度复盘，不包含特定业务表的压测对比；实际业务在升级大版本时，必须在预发布环境中克隆真实的只读存储卷（Storage Snapshot）进行全量只读重放验证。

## 参考资料

- PostgreSQL 19 Open Items Wiki (<https://wiki.postgresql.org/wiki/PostgreSQL_19_Open_Items>)
- PostgreSQL Source Commit `a32733d` (Revert GROUP BY ALL)
- Dimitri Fontaine: "Getting Ready for PostgreSQL 19" (<https://tapoueh.org/blog/2026/09/getting-ready-for-postgresql-19/>)
- 站内对照：PostgreSQL 膨胀与 Autovacuum 调优实战，`/writing/postgres-bloat-autovacuum`
- 架构演进：SQLite WAL Checkpoint 与存储引擎实现，`/writing/sqlite-wal-checkpoint`
