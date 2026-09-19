---
title: "Redis 与 Valkey 分叉点：IDMP/HOTKEYS 只在一边"
description: "Redis 8.6 的 streams 至多一次（IDMP）、HOTKEYS 原生命令与 Valkey 9.1 的安全补丁对照：wire 兼容不等于功能对等，选型看工作负载命中哪边。无实例实测的决策篇。"
publishedAt: "2026-09-18"
tags: ["Redis", "Valkey", "选型", "前沿追踪"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 分叉后第一次出现“只在一边”的功能：Redis 8.6（2026-02-10）有 streams 至多一次投递（`IDMP`）、原生 `HOTKEYS`、mTLS-CN 自动授权；Valkey 9.1（2026-05-19，3 个 CVE 修复）走 BSD-3 与线兼容路线。wire 兼容保证命令通，不保证新功能有。决策只看一条：你的负载是否命中独占功能——命中就跟那一边走，不命中就按成本与托管选。

## 一、对照表（2026-09-18 核对 release notes）

| 维度 | Redis 8.6 | Valkey 9.1 |
| --- | --- | --- |
| streams 语义 | IDMP/IDMPAUTO 至多一次 | 无对应 |
| 热点发现 | HOTKEYS 原生 | 无对应 |
| 安全 | 3 CVE 已修（UAF/RESTORE/全量同步） | 同类自己看公告 |
| 许可/费用 | RS 商业条款注意 | BSD-3 |
| 托管 | 各云 Redis 兼容层 | 各云 Valkey 选项比价 |

## 二、决策：两问

1. 用 streams 做队列且要至多一次？→ Redis 8.6（另看 AOF + IDMP 已知限制）。
2. 只用基础结构 + 计费敏感？→ Valkey，按托管价比。

## 三、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | <https://github.com/redis/redis/releases/tag/8.6.0>、<https://github.com/valkey-io/valkey/releases/tag/9.1.0>（2026-09-18 核对） |
| 不支持结论 | 真实吞吐、故障切换、托管账单——无实例，一律未验证 |

## 参考资料

- 上文 release notes 与 Redis 8.6 公告博客
- 前篇：Redis 作队列（消费组语义），`/writing/redis-as-mq-consume-groups`
