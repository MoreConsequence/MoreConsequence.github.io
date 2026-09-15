---
title: "韧性两算式：窗口限流与重试预算"
description: "定窗边界 2ms 可放 2 倍、滑窗压回 1 倍、令牌桶突发看容量稳态看速率；重试放大 1+p+p²+p³，p=20% 到 1.248x 即熔断。两组断言全过，同一主题：韧性参数必须算出来，不能拍脑袋。"
publishedAt: "2026-09-14"
tags: ["容错", "限流", "重试", "SRE"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 韧性的两个参数都要算：限流——定窗边界 2ms 放 200（2.00x），滑窗日志/计数压回 100，令牌桶突发放容量 100、稳态 100/s 全放、200/s 放 299（满桶+补充）；重试——放大 `1+p+p²+p³`，p=2% 仅 1.020408x，p=20% 到 1.248x 即熔断回 1.0。两组断言全过（3+3+4）。

## 一、窗口：突发看容量，稳态看速率

窗口算法只有一个旋钮（窗口长），突发和稳态绑死，边界 2ms 即 2x；令牌桶两个旋钮分开管。半开窗口 ±1 误差连“精确”的日志版也有——精度上限是 ±1 不是 0（`experiments/rate-limit-window-boundary/sim.py`）。

## 二、重试：固定次数在故障时最坏

p 超 10% 熔断停重试——固定重试次数恰好在最需要克制时火力全开。期望值手算复核过（`p³` 项：1.020408 不是 1.0204，`experiments/retry-budget/retry.py`）。

## 三、证据卡与边界

原始输出：`evidence/rate-limit-window-boundary/`（2026-09-13-local）、`evidence/retry-budget/`（2026-09-14-local）。不支持：真实 Redis 命令、退避抖动、半开恢复、分布式 skew。

## 参考资料

- 前篇：熔断三态，`/writing/rate-limiting-circuit-breaker`；Agent 熔断（同构），`/writing/agent-tooloop-fuse`
