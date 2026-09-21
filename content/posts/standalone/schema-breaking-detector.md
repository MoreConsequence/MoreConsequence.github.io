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

## 三、Registry 的七档答案

本文五判定是单版本 diff；生产用 Registry 是跨版本门禁（[Confluent 兼容性文档](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)，2026-09-20 核对）：默认 `BACKWARD`（新 schema 读旧数据，只对**最新版**），`TRANSITIVE` 查全历史，`FULL` 双向，另有 `NONE` 关检查。升级顺序由方向决定：BACKWARD 先升消费者，FORWARD 先升生产者，FULL 独立升级。映射：改名/改类型在 BW/FW 下都不兼容；加可选≈BW 放行；去 required≈FW 放行——本文的判定表恰好是 BACKWARD 视角的子集。

```js
// 实验核心（experiments/schema-diff/diff.mjs）：改类型与收窄即 breaking
if (o.type !== n.type) breaking.push(`retyped:${k}:${o.type}->${n.type}`);
if (!o.enum && n.enum) breaking.push(`narrowed:${k}:open->enum[${n.enum}]`);
```

## 四、证据卡与边界

纯逻辑 diff，无网络。不支持：嵌套/递归 schema、默认值语义、oneOf/anyOf 组合。

## 参考资料

- Confluent Schema Registry（兼容性检查的生产实现），<https://docs.confluent.io/platform/current/schema-registry/index.html>
- 前篇：错误形状喂模型（S6），`/writing/llm-error-shape-feeds-model`；Outbox 双写原子性（schema 演进的上下游），`/writing/outbox-cdc-dual-write-atomicity`
