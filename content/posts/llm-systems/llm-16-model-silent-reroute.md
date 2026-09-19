---
title: "模型 ID 会静默换芯：deepseek-v4-pro 切 Flash 的教训"
description: "2026-09-14 起 deepseek-v4-pro 路由到 V4.1-Flash 并按 Flash 计费：同 ID 不同质不同价。用确定性算术说明路由变更如何同时改质量与账单，并给出 trace 断言清单。"
publishedAt: "2026-09-18"
tags: ["LLM", "成本工程", "可观测性", "前沿追踪"]
draft: false
featured: false
series: "大模型后端架构与推理加速"
---

**TL;DR：** 2026-09-14 04:00 UTC 起，`deepseek-v4-pro` 路由到 V4.1-Flash 并按 Flash 费率计费（官方公告，V4.1-Pro 出前有效）。同 ID、不同质、不同价——质量变了（552B MoE Flash vs Pro），账单也变了（off-peak 可到 $0.15/$0.60）。教训只有一条：trace 里断言模型 ID 与价格，不信任名字。价格数字是公告快照假设输入，核对日期见下。

## 一、完整路径：一次静默换芯如何穿过你的系统

```text
9-13：调 v4-pro → Pro 质量 + Pro 价格
9-14 04:00：同 ID → Flash 质量 + Flash 价格（无代码变更）
  → 评测集分数漂移（若在跑 eval 门，门会先发现）
  → 月账单结构变化（若按旧价核算，预算对不上）
  → 自建网关缓存的“模型能力表”过期
```

## 二、防御清单（三条，全部可今天落地）

1. trace 记 `model` + `price_per_m`（调用时快照，不事后查表）。
2. eval 门绑定模型 ID：ID 变即重跑基线（见 eval 门篇）。
3. 网关能力表加 TTL + 变更订阅（release note RSS）。

## 三、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 一手来源 | <https://api-docs.deepseek.com/news/news260910>（V4.1-Flash 公告，2026-09-18 核对） |
| 价格 | 公告快照假设输入，非实时账单；上线前按官网重核 |
| 不支持结论 | 真实质量差、真实账单、自建网关行为——无调用，一律未验证 |

## 参考资料

- 上文 API 公告
- 前篇：账单敏感度（价格结构数学），`/writing/llm-10-model-bill-sensitivity`；eval 门（ID 绑定基线），`/writing/llm-12-eval-estimation-gates`
