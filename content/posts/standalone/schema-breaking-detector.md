---
title: "schema breaking 检测：改名与收窄标红，加可选放行"
description: "五类变更对照：改名检出 removed、类型收窄与改类型标 breaking，加可选字段与去 required 放行。用确定性 diff 5 断言锁定，S6 的 CI 门禁件。"
publishedAt: "2026-09-14"
tags: ["API 设计", "schema", "兼容性", "LLM"]
draft: false
featured: false
---

**TL;DR：** schema diff 五判定：改名（`age→years`）检出 `removed:age`，`string` 收窄成 enum 标 breaking，改类型标 `retyped`，加可选字段与去 `required` 放行。5 断言全过。规则即 S6 契约的 CI 化：破坏性变更必须人审通过才能合，安全变更自动放行。

## 一、合同

| 变更 | 判定 | 理由 |
| --- | --- | --- |
| 删字段/改名 | breaking | 旧客户端取值失败 |
| 改类型 | breaking | 解析语义变 |
| 加 enum 约束 | breaking | 老值可能不在枚举里 |
| 加可选字段 | 放行 | 旧客户端忽略 |
| 去 required | 放行 | 读侧兼容 |

## 二、实测

`experiments/schema-diff/diff.mjs`，`evidence/schema-diff/2026-09-14-local/run.out`，5 PASS。注意 B1：改名在 diff 层永远表现为“一删一加”——想识别“改名”而非“删+加”，需要相似度启发式，本文诚实地只报 removed。

## 三、证据卡与边界

纯逻辑 diff，无网络。不支持：嵌套/递归 schema、默认值语义、oneOf/anyOf 组合。

## 参考资料

- 前篇：错误形状喂模型（S6），`/writing/llm-error-shape-feeds-model`
