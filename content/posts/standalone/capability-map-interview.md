---
title: "后端能力地图：279 篇生产文章编成的面试叙事"
description: "把全库生产文章编成五段求职叙事：网络打底、Go 与 TS 双运行时、服务工程、数据存储、LLM 应用。每段给三篇代表作与面试问法，可直接发给面试官。"
publishedAt: "2026-09-14"
tags: ["求职", "技术写作", "面试", "地图"]
draft: false
featured: false
---

**TL;DR：** 本库 279 篇生产文章，按“网络→运行时→服务→数据→LLM”五段编成面试叙事，每段三篇代表作：网络（拥塞/BBR、QUIC、keep-alive）、运行时（GMP/事件循环、json v2、泛型禁区）、服务（幂等、熔断、SLO）、数据（WAL、隔离、FTS）、LLM（token 经济、eval 门、MCP 三部曲）。用法：面试前把对应段三篇重读一遍，带着证据数字去。

## 一、五段叙事与代表作

| 段 | 回答的问题 | 代表作 |
| --- | --- | --- |
| 网络 | 包怎么走、丢了怎么办 | `tcp-congestion-control-bbr`、`quic-http3-connection-migration`、`http-four-mechanisms` |
| 运行时 | 代码跑在哪、慢在哪 | `typescript-event-loop-vs-gmp`、`go-encoding-json-v2-goroutineleak`、`go-generic-methods-interface-boundary` |
| 服务 | 失败怎么办、怎么证明可靠 | `service-api-shape`（幂等）、`resilience-window-retry`、`service-observability-slo` |
| 数据 | 写到哪、怎么不丢 | `wal-crash-recovery`、`sqlite-wal-checkpoint`、`sqlite-index-two-shapes` |
| LLM 应用 | token 账单、eval 门、协议 | `llm-token-economics`、`llm-12-eval-estimation-gates`、`llm-09-mcp-stateless-core` |

## 二、面试问法对照

- “讲一次线上事故”→ incident-drama + burn-rate + 熔断（时间线→证据→根因三段式）。
- “幂等怎么做”→ service-api-shape（200/201/409 + 并发实验数字）。
- “LLM 成本怎么控”→ token 经济 + 账单敏感度（18.3x 与 10.7x 的适用条件）。
- “Go 新版本跟了吗”→ json v2 + 泛型禁区 + leak 画像（2026-09 实测）。

## 三、用法与边界

面试前重读对应段即可，不必通读。数字只报有 evidence 的；被问到没覆盖的（如 K8s 生产运维），诚实说“这块我还没攒证据”，比现场编强。本文是索引不是证据，数字以各正文为准。

更新纪律：正文新增/合并时同步改上表（slug 退役要跟着换，如 sqlite 三篇合并所示）；证据卡改了“不支持结论”，本表的措辞跟着收。索引的腐烂速度取决于更新纪律，不是初版质量。合并退役的 slug 在站内直接消失而不做跳转——外部引用会断，所以合并只做同主题短文，不动已有外部引用的长文，这是本轮三删一建的原则。

## 参考资料

- 全库目录：站内系列页与 `/writing` 归档
- 方法论：Will Larson《Staff Engineer》，<https://staffeng.com/>（用“代表作 + 影响力”讲能力的框架）
- 图中引用的三篇代表作：[`service-incident-drama`](/writing/service-incident-drama)、[`llm-10-model-bill-sensitivity`](/writing/llm-10-model-bill-sensitivity)、[`go-encoding-json-v2-goroutineleak`](/writing/go-encoding-json-v2-goroutineleak)

## 证据卡与边界

本文是索引性文章，无独立运行实验：所有数字均转引自各正文与其 `evidence/` 目录，以正文为准；面试覆盖声明以各篇“不支持结论”小节为准，未覆盖的领域本文不背书。
