---
title: "错误形状喂模型：粗码自愈 0/5，加 hint 到 5/5"
description: "同一失败两种喂法：只有 code 的粗错误 5 任务 0 自愈，加 retryable + 可执行 hint 后 5/5 自愈且最多 2 轮。用 stub 模型确定性对照锁定，S6 给 LLM 设计 API 的第一块实证。"
publishedAt: "2026-09-14"
tags: ["LLM", "API 设计", "Agent", "容错"]
draft: false
featured: false
---

**TL;DR：** 同一个 `E_CONN` 失败：只喂 `code`，stub 模型 5 任务 0 自愈；喂 `code + retryable + hint(use-read-replica)`，5/5 自愈且最多 2 轮。2 断言全过。这是 S6“给 LLM 设计 API”的第一块实证：错误形状不是给人看的，是给模型的修复策略当输入的——hint 必须是可执行的（切只读副本），不是形容词（“请重试”）。

## 一、合同：错误体的三栏

| 栏 | 粗码 | 富错误 | 判定标准 |
| --- | --- | --- | --- |
| code | 有 | 有 | 机器可分支 |
| retryable | 无 | 有 | 模型知道“重试有没有用” |
| hint | 无 | 可执行动作 | 模型下一轮能照做且成功 |

“请稍后重试”不是 hint，是安慰剂——可执行性由自愈率定义，不由文笔定义。

## 二、实测

`experiments/error-shape-heal/heal.mjs`，`evidence/error-shape-heal/2026-09-14-local/run.out`：H1 0/5、H2 5/5（≤2 轮）。

## 三、证据卡与边界

stub 模型确定性行为，非真实模型。不支持：真实模型自愈率、hint 最优粒度、错误码爆炸的维护成本（字段越多，契约越重）。

## 四、与契约篇的分工

前篇 [工具调用的契约](/writing/llm-tool-calling-contract)证明了错误形状决定调用成功率（0%/100%）；本文证明错误形状决定**失败后的自愈率**（0/5→5/5）。调用前与调用后各一篇，S6 拼图继续。

## 参考资料

- 前篇：工具调用的契约设计，`/writing/llm-tool-calling-contract`
