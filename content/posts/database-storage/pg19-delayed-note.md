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

## 二、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | PG  committing 邮件（Beta 4/冻结/10 月底目标）、roadmap（2026-09-19 核对，见扫描记录） |
| 不支持结论 | 被砍功能细节、性能对比、升级演练——无实例，一律未验证 |

## 参考资料

- 前篇：PG bloat 与 autovacuum（18.x 现实），`/writing/postgres-bloat-autovacuum`
