---
title: "设计一个支付回调系统：签名、去重、重试、查询一次串完"
description: "用已验证的四块拼一次完整系统设计：HMAC 签名验真、event id 去重、重试预算熔断、cursor 翻页查询。每块指到实测证据，失败矩阵一次列完。面试 system-design 题的答题骨架。"
publishedAt: "2026-09-14"
tags: ["系统设计", "面试", "webhook", "架构"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 设计支付回调 intake 按四步拼：HMAC 签名验真（篡改/错钥 401）→ event id 去重（复投不重执）→ 下游调用配重试预算（p=20% 熔断回 1.0x）→ 对账查询用 cursor（写入下无重行）。每步都有本机实测证据（见第四节映射表）。本文无新增实验——它是合成篇，新增的是四块之间的连线与失败矩阵。

## 一、完整路径：一次回调走完什么

```text
支付方 POST → 签名验真（401 拦）→ event id 去重（复投 200-duplicate）
  → 业务执行（原子 claim，同 key 同指纹重放/异指纹 409）
  → 下游通知（重试预算，p>10% 熔断）
  → 对账查询（cursor 翻页）
```

## 二、失败矩阵：每一步坏了是什么现象

| 故障 | 现象 | 哪篇管 |
| --- | --- | --- |
| 密钥泄漏 | 伪造回调执行 | webhook 轮换：双签过渡后退役 |
| 重复投递 | 重复入账 | 去重表 + 幂等 claim |
| 下游抖动 | 重试放大雪崩 | 重试预算：p>10% 停 |
| 对账翻页 | 重行漏行 | cursor 翻页 |

## 三、证据映射（无新增实验，全部引用）

| 拼块 | 证据篇 | 关键数字 |
| --- | --- | --- |
| 签名与去重 | `/writing/service-webhook-hmac` | 执行恰好 1 次，复投不重执 |
| 幂等 claim | `/writing/service-api-shape` | 100 并发 1 个 201 + 99 个 200，异指纹 409 |
| 重试预算 | `/writing/resilience-window-retry` | 1.02x/1.248x/熔断回 1.0 |
| 翻页查询 | `/writing/service-pagination-cursor` | offset 重 2 行，cursor 连续 |

## 四、面试答法：先骨架，再数字

system-design 面试按“路径→矩阵→数字”三段答：先画完整路径（一），再列失败矩阵（二），数字只报实测过的（三）。没证据的规模预估要标“假设待压测”，这是诚实分。

## 参考资料

- 上表四篇正文与其 evidence 目录
- Stripe：Webhooks 签名与重投，<https://docs.stripe.com/webhooks>；幂等键，<https://docs.stripe.com/api/idempotent_requests>
- 前篇：幂等工程（含 claim 模式），`/writing/idempotency-engineering`；Outbox 与双写原子性，`/writing/outbox-cdc-dual-write-atomicity`

## 证据卡与边界

本篇是拼装 walkthrough，无独立运行实验：签名、幂等、重试预算、翻页四块数字分别来自上表四篇正文的 `evidence/` 目录，以各正文为准；真实网关行为未经对接验证。
