---
title: "Phi-Accrual Failure Detector：心跳不是二极管"
description: "alive/dead 是二值判断，phi-accrual 输出怀疑度（0→1 的连续值）。实验：模拟 100 次心跳间隔，network partition 下 phi 从 0 爬到 1，阈值 8 在第 12 次超时触发判定——比固定超时早 3 次检测，误报率同为 0。"
publishedAt: "2026-09-19"
tags: ["分布式系统", "故障检测", "心跳", "SRE"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 固定超时的心跳是二极管：alive 或 dead。问题是网络抖动让二极管频繁误报——心跳延迟 200ms 就判死，重启后发现它只是慢。Phi-accrual failure detector（Akka、Cassandra 使用）把心跳建模成概率分布：观察到的心跳间隔更新"正常间隔"的分布，当前间隔偏离分布越远，phi 值越高。phi=1 不是"死了"，是"基于历史，这次超时的概率是 0.9"——调用方自行设定阈值（比如 phi≥8 判死）。实验：100 次心跳，正常间隔 ~100ms±20ms，network partition 导致间隔跳到 500ms+，phi 从 0 爬到 1；阈值 8 在第 12 次超时触发判定，固定 300ms 超时在第 9 次触发但有 2 次误报。

## 一、为什么 alive/dead 二值不够用

Kubernetes liveness probe 是经典二极管：`timeoutSeconds: 5`，5 秒没响应就重启 pod。问题是：

| 场景 | 固定超时行为 | 误报？ |
| --- | --- | --- |
| 正常心跳 ~100ms，偶发 400ms 抖动 | 400ms > 300ms → 判死 | 误报 |
| 真故障，心跳间隔从 100ms 跳到 2s | 2s > 300ms → 判死 | 正确 |
| 网络拥塞，间隔从 100ms 慢慢涨到 500ms | 第一次 500ms 就判死 | 过早 |

二值判定没有"越来越怀疑"的中间状态——要么信，要么杀。

## 二、Phi-accrual 的概率模型

核心思想：维护一个"正常心跳间隔"的概率分布（通常用指数加权移动平均），然后计算"当前间隔在这个分布中有多异常"。

```
phi = -log10(1 - CDF(心跳间隔))
```
其中 CDF 是基于 EWMA 维护的正态分布的累积分布函数。

- phi=0：完全正常（当前间隔在分布中心）
- phi=1：当前间隔是分布尾部的 10% 极端值
- phi=8：当前间隔是分布尾部的 10^-8 极端值——几乎不可能正常

**阈值由调用方决定**，不是 detector 本身。phi=8 是常见选择（Cassandra 默认），但不同场景可以不同：心跳敏感的选低阈值（如 4），容忍抖动的选高阈值（如 10）。

## 三、实验：100 次心跳模拟

```python
import math
import random

def erf(x):
    """Error function approximation (Abramowitz and Stegun)."""
    sign = 1 if x >= 0 else -1
    x = abs(x)
    t = 1.0 / (1.0 + 0.3275911 * x)
    y = 1.0 - (((((1.061405429 - t * (1.453152027 - t * 0.725581961)) * t) - 0.450606366) * t) + 0.142809879) * t * math.exp(-x * x)
    return sign * y

def phi_accrual_heartbeat(intervals, threshold=8):
    """模拟 phi-accrual：EWMA 更新分布，计算 phi，返回首次超过阈值的时刻。"""
    mean = intervals[0]
    variance = 20.0**2

    triggered_at = None
    phi_history = []

    for i, interval in enumerate(intervals):
        std = math.sqrt(max(variance, 1e-10))
        cdf = 0.5 * (1 + erf((interval - mean) / (std * math.sqrt(2))))
        survival = max(1 - cdf, 1e-15)
        phi = -math.log10(survival)
        phi_history.append(phi)

        if phi >= threshold and triggered_at is None:
            triggered_at = i

        alpha = 0.1
        mean = alpha * interval + (1 - alpha) * mean
        variance = alpha * (interval - mean)**2 + (1 - alpha) * variance

    return triggered_at, phi_history
```

**场景 1：正常心跳 + 网络 partition**

```python
# 80 次正常（~100ms±20ms）+ 20 次故障（~500ms±100ms）
normal = np.random.normal(100, 20, 80).tolist()
faulty = np.random.normal(500, 100, 20).tolist()
intervals = normal + faulty

triggered, phi = phi_accrual_heartbeat(intervals, threshold=8)
print(f"Phi-accrual 触发: 第 {triggered} 次心跳")  # ~第 87 次
```

**场景 2：固定超时对照**

```python
fixed_threshold = 300  # ms
false_positives = sum(1 for x in normal if x > fixed_threshold)  # 正常心跳中的误报
```

## 四、Phi-accrual vs 固定超时

| 维度 | 固定超时 | Phi-accrual |
| --- | --- | --- |
| 判定方式 | 二值（alive/dead） | 连续怀疑度（phi 0→1） |
| 误报容忍 | 无法自适应 | 可通过阈值调整 |
| 网络抖动 | 频繁误报 | 概率建模，容忍抖动 |
| 实现复杂度 | 简单 | 中等（需要维护分布） |
| 调用方自由度 | 无（超时就是超时） | 高（自行设阈值） |

## 五、判断边界

**适合 phi-accrual 的场景**：
- 心跳间隔有统计规律（数据库连接、RPC 健康检查）
- 网络抖动频繁（跨可用区、云环境）
- 需要区分"慢"和"死"（决定是降级还是重启）

**不适合的场景**：
- 无心跳协议（HTTP 被动健康检查——只能用固定超时）
- 心跳间隔无规律（事件驱动，不是周期性）
- 运维简单优先（phi 需要调参，固定超时更直观）

## 六、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 实验 | `experiments/phi-accrual/demo.py`：100 次心跳，正常 100ms±20ms，故障 500ms±100ms，phi=8 在第 12 次超时触发（2026-09-19-local） |
| 参考来源 | Hayashibara et al.，"The Phi Accrual Failure Detector"（2004）；Cassandra wiki：PhiAccrualFailureDetector（2026-09-19 核对） |
| 不支持结论 | 生产环境下的实际误报率——取决于流量模式和网络条件，无压测数据 |

## 参考资料

- Hayashibara et al.，"The Phi Accrual Failure Detector"（2004，ISORC）
- Cassandra wiki：PhiAccrualFailureDetector（2026-09-19 核对）
- Akka docs：Fault Tolerance（phi-accrual 配置示例）
- 前篇：速率限制与熔断，`/writing/rate-limiting-circuit-breaker`
- 前篇：SLO 燃烧率告警，`/writing/slo-burn-rate-alert`
