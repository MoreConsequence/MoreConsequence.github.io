---
title: "K8s 1.37：DRA 转正与 gang 调度的 Beta 入场券"
description: "1.37 把扩展资源 DRA 扶正，Workload/PodGroup  gang 调度进 Beta（默认关闭）。无集群实测的语义追踪：机制是什么、门槛在哪、GPU 队列何时能试。"
publishedAt: "2026-09-19"
tags: ["Kubernetes", "调度", "GPU", "前沿追踪"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** K8s 1.37（2026-08-26，67 个 enhancement）：DRA 扩展资源 GA，`Workload`/`PodGroup` 的 gang/all-or-nothing 调度进 Beta——但被 `GenericWorkload` 门控**默认关闭**，`v1alpha2`→`v1alpha3` 还有 breaking change。GPU/批量任务队列第一次能用原生调度器做 gang，但 Beta + 关默认 = 先在 staging 开门控试。无集群实测，机制与门槛以官方博客为准。

## 一、合同

| 维度 | 1.37 给什么 | 不给什么 | 调用者负责 |
| --- | --- | --- | --- |
| DRA | 扩展资源 GA | 旧自定义调度器自动迁移 | 设备插件与 ResourceClaim 改写 |
| gang 调度 | PodGroup Beta | 默认开启（门控关着） | manifest + feature-gate rollout |
| 兼容 | 1.35/1.36/1.37 三分支维护 | 跨 minor 无痛 | 按 1.38 GA 路线图排期 |

## 二、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | <https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/>、DRA（09-03）与 workload-aware scheduling（09-08）官方博客（2026-09-19 核对） |
| 不支持结论 | 真实 GPU 队列调度、升级演练、1.37.1 补丁内容——无集群，一律未验证 |

## 参考资料

- 上文官方博客
- 前篇：K8s 调度器资源账本（打分公式），`/writing/k8s-scheduler-resource-ledger`
