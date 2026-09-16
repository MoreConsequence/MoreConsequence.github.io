---
title: "SLO burn-rate 双阈值：ticket +7 分钟响，page +16 分钟确认"
description: "SLO 99.9% 下 30 天合成 trace（基线 0.1% + 30 分钟 5% 故障）：ticket（6h>2 且 1h>2）+7 分钟响，page（1h>14.4 且 5m>14.4）+16 分钟确认，基线期零误报。3 断言全过。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-16"
tags: ["SLO", "告警", "可观测性", "SRE"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** burn-rate 告警的关键不是阈值，是快慢双窗：ticket 窗（6h>2 且 1h>2）故障后 +7 分钟响，page 窗（1h>14.4 且 5m>14.4）+16 分钟确认，30 天基线零误报。3 断言全过。单窗方案要么误报（窗太短），要么迟到（窗太长）——双窗是唯一同时解两者的形状。

![burn-rate 八日峰值：平时 1.0，故障日 25.5](../../../public/images/slo-burn-rate-peak.svg)

## 一、完整路径：一次故障如何变成两次告警

```text
t+0 故障起（5% 错误）
  → t+7 ticket（6h 窗刚越 2x，值班先看）
  → t+16 page（1h 窗越 14.4x 且 5m 确认，起床）
  → t+30 故障止（burn 回落，告警自愈）
```

ticket 与 page 的差（9 分钟）是留给值班的预判窗口，不是延迟 bug。

## 二、合同

| 维度 | 快窗（page） | 慢窗（ticket） |
| --- | --- | --- |
| 抓什么 | 急性大故障 | 缓慢泄漏 |
| 代价 | 阈值高（14.4x），小故障不响 | 阈值低（2x），需二次确认防误报 |
| 调用者负责 | 预算耗尽速度换算（14.4x ≈ 2 天烧完月预算） | 值班手册分级 |

## 三、实测

`experiments/burn-rate-alert/burn.py`（30 天分钟级合成 trace），`evidence/burn-rate-alert/2026-09-14-local/run.out`，3 PASS。

## 四、证据卡与边界

纯算术合成 trace，非生产流量。不支持：真实告警延迟、多服务聚合、预算窗口（30 天滚动 vs 自然月）差异。

## 参考资料

- Google SRE Workbook：Alerting on SLOs（多窗 burn-rate 原始出处）
- 前篇：SLO handler 指标原型，`/writing/service-observability-slo`
