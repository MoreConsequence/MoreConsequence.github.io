---
title: "gossip 感染轮次：100 节点 fanout=1 用 16 轮，fanout=3 用 7 轮"
description: "每轮每感染者随机推 1 个（固定种子）：100 节点 16 轮全感染，fanout=3 只要 7 轮，多种子稳定。用纯模拟锁定对数级传播，并说明成员列表与反熵缺口。"
publishedAt: "2026-09-14"
tags: ["分布式系统", "gossip", "传播", "模拟"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** gossip 推送模型下 100 节点全感染：fanout=1 用 16 轮（宽松上界 18 轮内），fanout=3 只要 7 轮，多种子稳定。3 断言全过。结论是指数传播的形状——轮次随规模对数增长，随 fanout 线性下降。生产落地的三块另补：成员列表从哪来、反熵补漏、拜占庭不信任。

## 一、合同

| 维度 | 推送 gossip 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 覆盖 | 高概率全覆盖（非 100% 确定） | 到达时间上确界 | 反熵/ack 补尾部 |
| 轮次 | 对数级（本参 16 轮） | 常数（规模翻倍仍加轮） | fanout 与带宽预算 |
| 成员 | 假设已知 | 发现与故障检测 | SWIM/seed 列表另起机制 |

## 二、实测

`experiments/gossip-rounds/gossip.py`（固定种子 7 + 多种子对照），`evidence/gossip-rounds/2026-09-14-local/run.out`，3 PASS。

## 三、证据卡与边界

纯模拟，无网络、无故障注入。不支持：真实丢包/分区、成员变更、与反熵组合。

## 参考资料

- Demers et al. 1987：Epidemic Algorithms（gossip 原始论文）
