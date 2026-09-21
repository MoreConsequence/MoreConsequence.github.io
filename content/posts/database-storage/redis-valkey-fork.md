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

## 二、分叉史：许可先行，功能随后

2024 年 3 月 Redis 改许可（RSAL/SSPL）是分叉原点：云厂商与社区在 Linux 基金会下立 Valkey，走 BSD-3 + 线兼容路线，保证存量命令与客户端不动；Redis 官方继续商业版路线，把新功能做进 8.x。本文对照表里的“只在一边”正是分叉一年半后的自然结果：线兼容冻结的是过去，独占功能长在各自的未来。选型因此分两层：先看许可与托管（成本层，大多数团队止步于此），再看负载是否命中独占功能（语义层，命中才跟）。

## 三、独占功能的语义代价（8.6 release notes 一手）

IDMP 不是免费的语义升级：`XADD ... IDMP/IDMPAUTO` 给 streams 至多一次投递，但已知限制——`appendonly yes` 配 `aof-use-rdb-preamble no`（非默认）时别用，等补丁。同版另有 `volatile-lrm`/`allkeys-lrm`（按最近修改时间淘汰）与 `HOTKEYS` 原生命令、TLS 证书自动认证。含义：跟 Redis 一边不只是“拿功能”，还要吃该功能的已知限制；跟 Valkey 一边则是用 BSD-3 确定性换“这些语义自己造”（消费组 + 幂等键，见前篇）。

落地时把“独占”翻译成运维动作：热点发现是刚需（大 key 治理、慢查询归因）才跟 `HOTKEYS`；淘汰策略要按修改时间才跟 LRM；streams 要至多一次先看 AOF 配置撞不撞已知限制。三者都不命中，Valkey 的确定性更便宜——回到第二问的成本比较，不加戏。已有慢查询日志能定位大 key 的团队，`HOTKEYS` 只是把手工活自动化——先算人力账，再算功能账。版本选择另看托管：云厂商的 Valkey 选项与 Redis 兼容层按量比价，价差常常大于功能差。

## 四、决策：两问

1. 用 streams 做队列且要至多一次？→ Redis 8.6（另看 AOF + IDMP 已知限制）。
2. 只用基础结构 + 计费敏感？→ Valkey，按托管价比。

## 五、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | <https://github.com/redis/redis/releases/tag/8.6.0>、<https://github.com/valkey-io/valkey/releases/tag/9.1.0>（2026-09-18 核对） |
| 不支持结论 | 真实吞吐、故障切换、托管账单——无实例，一律未验证 |

## 参考资料

- 上文 release notes 与 Redis 8.6 公告博客；Valkey 官网，<https://valkey.io/>；Redis 官网，<https://redis.io/>
- 前篇：Redis 作队列（消费组语义），`/writing/redis-as-mq-consume-groups`；RDB/AOF 持久化，`/writing/redis-persistence-rdb-aof`
