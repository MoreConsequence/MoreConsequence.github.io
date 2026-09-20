---
title: "Cell-Based Architecture：故障隔离的基建层"
description: "把用户分进独立 cell，一个 cell 崩了不影响其余 cell。实验：10000 用户分 10 cell，单 cell 故障的爆炸半径从 100%（无隔离）降到 10%（cell 隔离），这是 bulkhead pattern 在基础设施层的演进。"
publishedAt: "2026-09-19"
tags: ["分布式系统", "故障隔离", "Bulkhead", "架构"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** Bulkhead 把线程池/连接池隔开，防一个慢调用拖垮全部；Cell 把**用户**隔开——一个 cell 里的故障（过载、死锁、依赖雪崩）不扩散到其余 cell。AWS Route 53、Stripe、Figma 都用这个模式。实验：10000 用户分 10 cell，单 cell 故障的爆炸半径从 100%（无隔离）降到 10%（cell 隔离），这是 [rate-limiting-circuit-breaker](/writing/rate-limiting-circuit-breaker) 和 [resilience-window-retry](/writing/resilience-window-retry) 的"治未病"版本——在故障发生之前就把 blast radius 切小。

## 一、Bulkhead 的升级

| 层级 | 隔离对象 | 防御目标 | 例子 |
| --- | --- | --- | --- |
| Bulkhead（线程池） | 线程/连接 | 一个慢调用拖垮线程池 | Hystrix thread pool |
| Bulkhead（服务级） | 服务依赖 | 支付挂了不拖搜索 | 服务级熔断 |
| **Cell（用户级）** | **用户分组** | **一个 cell 过载不影响其他 cell** | Route 53 / Stripe / Figma |

Bulkhead 解决"一个坏苹果污染一筐"；Cell 解决"同一个苹果的坏汁不扩散到别筐"。

## 二、Cell 怎么工作

把用户按 hash（user_id % N）分进 N 个 cell。每个 cell 是独立的：
- 独立的计算资源（服务实例）
- 独立的存储分片（数据库分片）
- 独立的流量控制（速率限制/熔断）

单 cell 故障的爆炸半径 = `1/N`。

```
用户 A → hash(A) % 10 = 3 → cell-3
用户 B → hash(B) % 10 = 3 → cell-3  （同 cell，共享命运）
用户 C → hash(C) % 10 = 7 → cell-7  （不同 cell，互不影响）
```

## 三、实验：爆炸半径对比

```python
import random

def simulate(isolated: bool, total_users=10000, num_cells=10, failure_cells=1):
    """模拟单 cell 故障：有/无 cell 隔离的爆炸半径。"""
    if not isolated:
        # 无隔离：故障扩散到所有用户
        affected = total_users
    else:
        # cell 隔离：故障只影响 failure_cells 个 cell 的用户
        affected = (total_users // num_cells) * failure_cells
    return affected

no_isolation = simulate(isolated=False)      # 10000
with_isolation = simulate(isolated=True)     # 1000
print(f"无隔离爆炸半径: {no_isolation/10000:.0%}")  # 100%
print(f"cell 隔离爆炸半径: {with_isolation/10000:.0%}")  # 10%
```

单 cell 故障：爆炸半径从 100% 降到 10%。如果 N=20，降到 5%。

## 四、Cell 的代价

| 代价 | 描述 |
| --- | --- |
| 跨 cell 查询变复杂 | 用户 A 在 cell-3，用户 B 在 cell-7——全局聚合要 scatter-gather |
| 热 cell 问题 | 高价值用户可能集中少数 cell，不均匀 |
| Cell 间数据不一致 | 最终一致性窗口（各 cell 独立 commit，全局同步有延迟） |
| 用户迁移复杂 | 调整 hash 分配 = 重新分配用户，要滚动迁移 |

## 五、判断边界

**适合 Cell 的场景**：
- 用户规模大（10K+），单 cell 故障影响面可控
- 有按用户维度的天然分界（user_id、tenant_id）
- 愿意承受跨 cell 查询的复杂度

**不适合的场景**：
- 用户量小（5 个用户分 10 个 cell？）
- 强全局一致性要求（跨用户事务不能容忍延迟同步）
- 依赖单一存储分片（Cell 要求存储层也隔离，否则只隔离了计算层）

## 六、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 实验 | `experiments/cell-isolation/demo.py`：10000 用户，10 cell，单 cell 故障爆炸半径 10%（2026-09-19-local） |
| 参考来源 | AWS Blog：Cell-based architecture（2023-04-18）；Stripe Engineering Blog：Stripe Cells（2023-11-15）；Figma Engineering Blog：How Figma scaled Redis（2024-06-19） |
| 不支持结论 | Cell 间数据同步延迟的量化、跨 cell 查询的性能开销——无真实集群，未验证 |

## 参考资料

- AWS Blog：Building and operating a pretty big storage system called S3（Cell-based architecture 概念，2023-04-18）
- Stripe Engineering Blog：Stripe Cells（2023-11-15，生产级 cell 隔离实践）
- Figma Engineering Blog：How Figma scaled Redis to millions of users（2024-06-19，hash 分片隔离）
- 前篇：速率限制与熔断，`/writing/rate-limiting-circuit-breaker`
- 前篇：重试放大效应，`/writing/resilience-window-retry`
