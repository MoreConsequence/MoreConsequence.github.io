---
title: "PG 19 跳票到 10 月底：野心功能被 revert 的教训"
description: "PG 19 Beta 4（09-24）后 GA 推到 10 月底：两个 headline 功能在 beta 最后三周被 revert 降级。无实例的前沿追踪：时间线、被砍的是什么量级的事、生产现在怎么办。"
publishedAt: "2026-09-19"
tags: ["PostgreSQL", "版本", "前沿追踪"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** PG 19 原定 9 月底 GA，现推到 10 月底（Beta 4 在 09-24，09-19 冻结）：beta 最后三周有两个 headline 功能被 revert——野心越大，review 越狠。生产结论一行：依赖 19 新特性的迁移全停，守 18.x；`pg_upgrade` + 扩展等 Beta 4 再测。无实例，时间线以官方邮件与 roadmap 为准。

## 一、教训：revert 是质量信号，不是失败

beta 期砍功能是 Postgres 流程健康的表现：宁可减 scope，不带病 GA。反例是赶火车把半成品写进稳定版——下游五年还债。等 19 的正确姿势：跟踪 open items 进 RC，而不是按原日期排人力。

## 二、被砍的是什么：三个名字与两个数字

beta 起累计 53 次 revert（PG18 同期约 44 次，[Snowflake 09-16 盘点](https://www.snowflake.com/en/blog/engineering/postgresql-19-release-delay-feature-reverts/)）。点名三个：

- **GROUP BY ALL**：post-commit review 发现 ORDER BY 非默认相等语义下返回错结果，late beta 改不动——revert，v20 再试（一手：cfbot revert commit `a32733d`，理由原文“too much code churn for late beta”）。
- **MERGE/SPLIT PARTITION**：08-27 整 feature revert，设计问题；这是它第二次被砍（PG17 因同类原因）。附带教训：revert 五天后 release notes 条目还在——看 notes 不如看分支，Beta 3 有的功能，Beta 4 未必有（[Fontaine 09-03 实测](https://tapoueh.org/blog/2026/09/getting-ready-for-postgresql-19/)）。
- **SQL/PGQ 图查询**：设计与就绪度 concerns，被砍，PG20 材料。

时间线以 [19 Open Items](https://wiki.postgresql.org/wiki/PostgreSQL_19_Open_Items) 为准：Beta 4 在 09-24，RC 与 GA 待定。生产姿势不变：守 18.x；另记 Fontaine 的升级防火清单（JIT 默认关、`standard_conforming_strings` 锁死、RADIUS 移除、MD5 登录告警）——升 19 前逐条过。

## 三、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | PG  committing 邮件（Beta 4/冻结/10 月底目标）、roadmap（2026-09-19 核对，见扫描记录） |
| 不支持结论 | 被砍功能细节、性能对比、升级演练——无实例，一律未验证 |

## 参考资料

- 19 Open Items（时间线一手），<https://wiki.postgresql.org/wiki/PostgreSQL_19_Open_Items>；53 次 revert 盘点，<https://www.snowflake.com/en/blog/engineering/postgresql-19-release-delay-feature-reverts/>；Fontaine 升级实测，<https://tapoueh.org/blog/2026/09/getting-ready-for-postgresql-19/>（2026-09-20 核对）
- PostgreSQL beta 测试页，<https://www.postgresql.org/developer/beta/>；pgsql-hackers 归档（commitfest 与 revert 讨论的一手来源），<https://www.postgresql.org/list/pgsql-hackers/>
- 前篇：PG bloat 与 autovacuum（18.x 现实），`/writing/postgres-bloat-autovacuum`
