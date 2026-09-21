---
title: "Kafka 4.1 Queues：不数分区也能点对点"
description: "KIP-932 share group 让 Kafka 做队列语义：协同消费无分区分配、逐条 ack、投递计数可见。用消费组与 share 组对照表讲清语义差，并声明无集群实测边界。"
publishedAt: "2026-09-18"
tags: ["Kafka", "消息队列", "分布式系统", "前沿追踪"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** Kafka 4.1（KIP-932，2026-09-18 核对官方博客）带来 Queues 预览：share group 协同消费、无需按分区数 sharding、逐条 ack + 投递次数可见。点对点从此不要求“分区数 ≥ 消费者数”。但这是 preview 语义——生产硬化待验证，本文无集群实测，只有语义对照与选用表。

## 一、完整路径：一条消息走完什么

```text
producer → share group（无分区分配）
  → 消费者协同拉取 → 逐条处理
  → 逐条 ack（成功）/ 超时重投递（计数+1）
  → 投递次数超限 → 死信/告警（按配置）
```

## 二、合同：share 组 vs 消费组

| 维度 | 消费组（经典） | share 组（Queues 预览） |
| --- | --- | --- |
| 分配单元 | 分区（独占） | 记录（协同） |
| 扩容约束 | 消费者数 ≤ 分区数 | 无此约束 |
| 提交 | offset 批量 | 逐条 ack |
| 重试语义 | seek 回放（粗） | 投递计数可见（细） |
| 顺序 | 分区内有序 | 同 key 需另行保证 |
| 成熟度 | 生产多年 | preview，硬化中 |

## 三、选用：三行

1. 点对点 + 消费者数经常变 → share 组（不用为扩容预建分区）。
2. 严格分区有序 → 留在消费组。
3. 已有 MirrorMaker 跨机房 → 先看 Redpanda Stretch（同期另一条路），再比。

## 四、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | <https://kafka.apache.org/blog/2025/09/04/apache-kafka-4.1.0-release-announcement/>、4.1.2（2026-03-17）同站（2026-09-18 核对） |
| 不支持结论 | 生产吞吐、重平衡行为、精确一次、运维成本——无集群，一律未验证 |

## 参考资料

- KIP-932 与上文官方博客；Kafka 官方文档（消费语义），<https://kafka.apache.org/documentation/>
- 前篇：Kafka 再均衡停顿，`/writing/kafka-rebalance-stop-the-world`；Redis 作队列（消费组语义对照），`/writing/redis-as-mq-consume-groups`
