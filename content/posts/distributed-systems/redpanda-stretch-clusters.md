---
title: "Redpanda Stretch Clusters：单逻辑集群横跨多 region"
description: "Operator 26.2 把 Stretch Clusters 扶正：Raft 多数派横跨 region，RPO=0/RTO=0、无故障切换步骤。无集群实测的语义追踪：与 MirrorMaker 的本质差、重启探针与网关 ranges。"
publishedAt: "2026-09-19"
tags: ["Kafka", "Redpanda", "多活", "前沿追踪"]
draft: true
featured: false
series: "系统设计手记"
---

**TL;DR：** Redpanda Operator 26.2（2026-08-11，2026-09-19 核对官方博客）：Stretch Clusters GA——一个逻辑集群横跨多个 K8s 集群，Raft 多数派本身就跨故障域，所以 RPO=0（无丢失）、RTO=0（无切换步骤，只是重新选主）。与 MirrorMaker 的本质差：镜像是事后复制（永远有窗口），Stretch 是多数派写（确认即跨域）。同版本另有 per-broker 重启探针（看实际复制状态再滚，失败关闭）与网关 API。Enterprise 与否、生产行为均未验证，见边界。

## 一、合同

| 方案 | RPO | RTO | 代价 |
| --- | --- | --- | --- |
| MirrorMaker/镜像 | >0（窗口） | >0（切换） | 运维简单 |
| Stretch（Raft 跨域） | 0（quorum 内） | 0（重选主） | 跨域写延迟、Enterprise 许可 |
| share group（Kafka 4.1） | 不适用（消费语义） | — | 正交维度，别混选 |

## 二、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | <https://www.redpanda.com/blog/multi-region-high-availability-kafka-stretch-clusters>（2026-08-11，2026-09-19 核对） |
| 不支持结论 | 真实跨域延迟、脑裂行为、账单、与 Kafka share group 的组合——无集群，一律未验证 |

## 参考资料

- 上文官方博客与 Operator release notes
- 前篇：Kafka Queues（消费语义正交），`/writing/kafka-queues-share-groups`；Kafka 再均衡停顿，`/writing/kafka-rebalance-stop-the-world`
