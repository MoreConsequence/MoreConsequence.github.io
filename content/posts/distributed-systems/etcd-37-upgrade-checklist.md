---
title: "etcd 3.7：RangeStream 分块读与升级前的 flag 审计"
description: "etcd 3.7 的 RangeStream 把大 range 读改成分块流，keys-only 查询不碰 bbolt value；代价是 experimental flag 全改 feature-gate，多架构镜像与前置版本要求。无集群实测的升级检查单。"
publishedAt: "2026-09-18"
tags: ["etcd", "Kubernetes", "升级", "前沿追踪"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** etcd 3.7（2026-07-08，2026-09-18 核对官方博客）：`RangeStream` RPC 把大 range 读改成分块流（服务端/客户端内存与延迟可预测），keys-only 查询走内存索引不加载 value。但升级有三道坎：全部 `--experimental-*` flag 删除（改 feature-gate）、仅多架构镜像、滚动升级要求先到 v3.6.11+。无集群实测，本文是检查单不是测评。

## 一、升级检查单

```text
1. grep 全仓 --experimental-（有即改 feature-gate）
2. 确认当前 >= v3.6.11（否则先升小版本）
3. 镜像改多架构路径
4. 大 list（CRD 多）业务先在 staging 看 RangeStream 延迟
5. v2 快照生成 3.8 即删——依赖它的备份脚本现在就改
```

## 二、合同

| 维度 | 3.7 保证 | 不保证 | 调用者负责 |
| --- | --- | --- | --- |
| 大读 | 分块、可预测内存 | 自动变快（需客户端用新 RPC） | 客户端升级 |
| keys-only | 不读 value | `SortTarget==VALUE` 照样读 | 查询写法 |
| 兼容 | 文档化前置版本 | 无痛（flag 与镜像都变） | 按检查单走 |

## 三、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | <https://etcd.io/blog/2026/announcing-etcd-3.7/>、7-23 补丁公告（2026-09-18 核对） |
| 不支持结论 | 真实延迟收益、升级演练、生产稳定性——无集群，一律未验证 |

## 参考资料

- 上文官方博客与 release notes
- 前篇：K8s watch 与 etcd（大 list 场景），`/writing/k8s-controller-watch-etcd`
