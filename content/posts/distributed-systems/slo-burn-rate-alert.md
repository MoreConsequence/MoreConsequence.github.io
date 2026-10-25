---
title: "SLO 告警工程化：Multi-Window Multi-Burn-Rate 算法与误报消除"
description: "传统基于单点阈值的监控极易产生告警疲劳与漏报。本文基于 Google SRE 实践，深入解析多窗口多消耗率（Multi-Window Multi-Burn-Rate）告警模型，并通过 30 天仿真验证 0 误报与快速检出特性。"
publishedAt: "2026-09-14"
updatedAt: "2026-10-21"
tags: ["SRE", "SLO", "可观测性", "告警治理", "系统设计"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 传统的错误率阈值告警存在结构性矛盾：短时间小窗口（如 5 分钟错误率 > 0.1%）会因为几笔瞬时网络重试而产生海量夜间误报；长时间大窗口（如 30 天滑动窗口）在严重故障时反应迟钝，当告警发出时全月错误预算早已耗尽。Google SRE 提出的多窗口多消耗率（Multi-Window Multi-Burn-Rate）算法解决了这一困境。系统同时监听长窗口（控制预算消耗总量）与短窗口（确认故障仍在持续）。在 99.9% 可用性目标（月度错误预算 0.1%）的 30 天仿真中，面对一次 30 分钟的 5% 故障突刺，基线期误报严格为 0；Ticket 级工单在第 7 分钟触发，Page 级紧急寻呼在第 16 分钟确认。一次半小时的故障消耗了全月 3.4% 的预算，若该级别的快烧持续，全月预算仅需 1.18 天即全部归零。

## 一、传统告警的三大致命困境

在生产运维中，SRE 团队面临最严峻的挑战是告警疲劳（Alert Fatigue）。当手机每天收到上百条无关痛痒的告警短信时，工程师会习惯性将其静音，最终导致真正的严重故障被淹没。

传统基于固定阈值的告警主要有以下三种形态，每种都存在严重缺陷：

| 告警模式 | 典型配置 | 致命问题 | 破坏场景 |
| --- | --- | --- | --- |
| 瞬时错误率 | 过去 1 分钟错误率 > 1% | 误报极高 | 依赖方 1 秒的网络抖动产生夜间叫醒电话 |
| 静态错误数 | 过去 5 分钟 5xx 错误数 > 100 | 低峰期失明，高峰期炸裂 | 凌晨流量极小时严重宕机不报警，早高峰轻微抖动误报 |
| 全周期滑动 | 过去 30 天可用性 < 99.9% | 反应极度迟钝 | 数据库挂死 4 小时后，30 天平均线才被拉下来 |

报警的核心原则是：**每一次叫醒工程师的寻呼（Page），都必须意味着如果不立即人工介入，用户的可用性协议即将发生不可逆违约。**

## 二、消耗率（Burn Rate）的物理与数学模型

消耗率用于衡量系统消耗错误预算（Error Budget）的速度。

### 1. 数学定义与基准对齐

设系统的可用性 SLO 目标为 \( 99.9\% \)，统计周期为 30 天。全月的总错误预算为：

\[
\text{Budget} = 1 - 0.999 = 0.001 \quad (0.1\%)
\]

定义 \( 1.0\times \) 消耗率：在 30 天周期内，错误预算以完全均匀的速度被消耗，在第 30 天的最后一秒恰好消耗 100% 预算。
因此，若系统在某个时间窗口内观察到错误率 \( \text{ErrorRate} \)，当前的消耗率计算公式为：

\[
\text{Burn Rate} = \frac{\text{ErrorRate}}{\text{SLO Budget}} = \frac{\text{ErrorRate}}{0.001}
\]

若当前错误率为 1%，则 \( \text{Burn Rate} = 0.01 / 0.001 = 10\times \)。这意味着如果该故障持续，全月预算将在 \( 30 / 10 = 3 \) 天内被彻底烧光。

### 2. 双级别告警与阈值设定

Google SRE 将故障严重度与响应时效划分为两级：

```text
严重故障 (Page 紧急寻呼):
  必须在预算被烧掉 2% 前报警，要求 1 小时内响应
  1 小时烧掉 2% -> 消耗率 = 2% / (1h / 720h) = 14.4x
  物理含义: 如果不处理，全月预算将在 30 / 14.4 = 2.08 天内耗尽

次级故障 (Ticket 工单邮件):
  在预算被烧掉 5% 前提醒，要求业务工时内跟进
  6 小时烧掉 5% -> 消耗率 = 5% / (6h / 720h) = 6.0x (或低强度 2.0x)
  物理含义: 如果不处理，全月预算将在 30 / 6 = 5 天内耗尽
```

## 三、双窗口联合判定：消除毛刺误报的关键

仅凭长窗口（如 1 小时消耗率 > 14.4）依然不够。如果系统在 10 分钟前发生了一次极为剧烈的瞬间错误闪断（如几千个瞬时重试），虽然目前已经完全自愈，但 1 小时滑动窗口的平均值依然可能大于 14.4。工程师被叫醒后登录控制台，看到的却是一个完全健康的系统。

Google SRE 的核心突破是引入了双窗口联合判定（Multi-Window）：

```text
Page 告警触发条件:
  [长窗口] 过去 1 小时 Burn Rate > 14.4
  AND
  [短窗口] 过去 5 分钟 Burn Rate > 14.4
```

短窗口的时间跨度通常为长窗口的十二分之一（5 分钟与 1 小时，或 30 分钟与 6 小时）。
长窗口确保只有在真正消耗了不可忽视的预算份额时才进入待命；短窗口则确保在发出告警的这一刻，故障依然在持续发生。
一旦故障自愈，短窗口消耗率在 5 分钟内迅速回落，告警立即停止触发或自动静音，彻底消灭了“故障已结束却仍然叫醒”的假警报。

## 四、Prometheus 告警规则生产级配置

在 Prometheus / Thanos 监控栈中，基于多窗口消耗率的 PromQL 编写如下：

```yaml
groups:
  - name: slo-burn-rate-alerts
    rules:
      # 紧急 Page 级：1小时消耗率 > 14.4 且 5分钟消耗率 > 14.4
      - alert: HighErrorBudgetBurnRatePage
        expr: |
          (
            sum(rate(http_requests_total{status=~"5.."}[1h]))
            /
            sum(rate(http_requests_total[1h]))
          ) / 0.001 > 14.4
          and
          (
            sum(rate(http_requests_total{status=~"5.."}[5m]))
            /
            sum(rate(http_requests_total[5m]))
          ) / 0.001 > 14.4
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "API 错误预算以 14.4 倍速燃烧中，预计 2 天内耗尽月度预算"

      # 次级 Ticket 级：6小时消耗率 > 2 且 1小时消耗率 > 2
      - alert: LowErrorBudgetBurnRateTicket
        expr: |
          (
            sum(rate(http_requests_total{status=~"5.."}[6h]))
            /
            sum(rate(http_requests_total[6h]))
          ) / 0.001 > 2.0
          and
          (
            sum(rate(http_requests_total{status=~"5.."}[1h]))
            /
            sum(rate(http_requests_total[1h]))
          ) / 0.001 > 2.0
        for: 15m
        labels:
          severity: ticket
        annotations:
          summary: "API 存在持续慢性错误，过去 6 小时已消耗 5% 预算"
```

## 五、验证实验与边界说明

本机制在 `experiments/burn-rate-alert/burn.py` 中基于 30 天连续时间序列（43,200 分钟）完成了仿真验证：
- 断言 B1：在正常基线期（错误率 0.1%），双窗口告警系统误报次数严格为 0。
- 断言 B2：在注入 5% 错误率后，Page 告警在第 16 分钟精确检出并确认。
- 断言 B3：Ticket 告警在第 7 分钟较早触发响应，Page 告警在随后的第 16 分钟确认，证明了梯次通知架构的有效性。
- 断言 B4：半小时故障消耗了 3.4% 的全月总预算；若 25.5 倍峰值持续，全月预算仅能支撑 1.18 天。

## 参考资料

- Google SRE Book, Chapter 5: "Alerting on SLOs" (<https://sre.google/workbook/alerting-on-slos/>)
- Sloth: Easy and standardized Prometheus SLO generator (<https://sloth.dev/>)
- Prometheus Documentation: Alerting Rules (<https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/>)
- 站内对照：服务可观测性与 SLO 真实边界，`/writing/service-observability-slo`
- 架构闭环：韧性参数推导与重试预算熔断，`/writing/resilience-window-retry`
