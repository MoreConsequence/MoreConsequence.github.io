---
title: "Agent 自愈机制的错误形状工程：从粗糙状态码到结构化引导契约"
description: "大模型工具调用的失败反馈决定了 Agent 的自愈成功率。本文系统拆解粗糙错误码导致模型反复盲目重试的病因，构建包含 retryable 判定、可执行 Hint 与 JSON Schema 校验差分的富错误反馈模型，实测自愈率从 0/5 跃升至 5/5。"
publishedAt: "2026-09-14"
updatedAt: "2026-10-22"
tags: ["LLM", "Agent", "错误处理", "API 设计", "自愈架构"]
draft: false
featured: false
---

**TL;DR：** 在自主智能体（Autonomous Agent）的工具调用闭环中，工具返回的错误信息绝非写给人类看的日志文本，而是直接参与下一轮模型推理的控制信号。传统微服务返回的粗糙错误（如纯状态码 `{"error": "E_CONN"}` 或 HTTP 400）在实测中导致智能体的自愈成功率为 0/5；而包含文笔修饰的安慰剂式提示（如“请稍后重试”）同样无法改变盲目重试的命运。只有当错误载荷被设计为结构化的“可执行控制契约”——明确声明是否可重试（`retryable`）、具体的参数校验差分，以及可执行的备选行动指南（如 `use-read-replica`）时，智能体的多轮自愈成功率能够达到 100%（5/5 且全部在 2 轮内自愈成功）。

## 一、智能体工具调用的自愈困境

在基于大模型构建的 Agent 系统（如 Coding Agent、自动化工作流）中，工具调用链通常呈现循环状态机：

```text
模型意图识别 -> 发起 Tool Call -> 本地环境执行 -> 捕获执行异常 -> 错误回填 Prompt -> 模型再次规划
```

传统 RESTful API 或命令行工具的错误输出是面向人类工程师设计的：
- 常见的错误形如：`{"code": 400, "message": "Bad Request"}`。
- 或者是长篇大论的堆栈跟踪信息（Stack Trace）。

当这些未经加工的错误原样喂回给大模型时，模型往往陷入三种典型困境：
1. **盲目原地重试**：模型不知道当前错误属于可恢复的网络抖动，还是必不可恢复的语法违规，只能机械重复刚才完全一致的入参。
2. **意图漂移与幻觉借口**：模型看到含糊不清的提示后，开始编造不存在的参数，甚至放弃当前任务向用户回复“由于系统权限不足，无法继续执行”。
3. **上下文爆炸**：原始堆栈动辄消耗数千 Token，挤占了宝贵的上下文窗口。

## 二、三种错误载荷的确定性实验对照

为了量化不同错误形状对大模型决策的影响，我们在 `experiments/error-shape-heal/` 中设计了针对同一数据库连接失败（`E_CONN`）的对比实验。

```text
形态 1: 粗糙错误码 (Coarse Code)
  {"code": "E_CONN"}
  模型反应: 无法推断失败根因与恢复路径 -> 0/5 成功自愈

形态 2: 安慰剂提示词 (Placebo Adjectives)
  {"code": "E_CONN", "hint": "数据库连接暂时异常，请稍后再次重试"}
  模型反应: 照着提示词再次发送完全相同的请求 -> 0/5 成功自愈

形态 3: 结构化富错误契约 (Rich Actionable Error Shape)
  {"code": "E_CONN", "retryable": true, "hint": "use-read-replica", "target": "readonly_db"}
  模型反应: 明确感知到主库挂死且从库可用 -> 100% 切换路由成功自愈 (5/5，<=2 轮)
```

| 错误形状类别 | 错误载荷结构 | 包含的控制信息 | 智能体自愈表现 |
| --- | --- | --- | --- |
| 粗码形态 | `{"code": "E_CONN"}` | 仅机器可分支的枚举值 | 0/5 成功（无法决策） |
| 安慰剂提示 | `{"code": "E_CONN", "hint": "请重试"}` | 带有自然语言形容词，无具体动作 | 0/5 成功（陷入机械死循环） |
| 可执行富契约 | `{"code": "E_CONN", "retryable": true, "hint": "use-read-replica"}` | 明确可重试性、具体参数与备选方案 | **5/5 成功**（2 轮内全部自愈） |

实验数据证明：**可执行性是由自愈率定义的，而不是由提示词的文笔修饰定义的。** 任何不能指引模型在下一轮明确调用哪个备选参数或分支的提示，本质上都是无效的安慰剂。

## 三、生产级 Agent 错误契约设计规范

在为 Agent 开发 MCP（Model Context Protocol）工具或内部函数库时，错误响应对象必须遵循以下字段规范：

```json
{
  "status": "error",
  "error": {
    "code": "INVALID_ARGUMENT",
    "retryable": false,
    "message": "Field 'user_id' must be a valid UUIDv7 string",
    "diff": {
      "path": "user_id",
      "received": "1001",
      "expected_format": "xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx"
    },
    "actionable_hint": "Please generate a fresh UUIDv7 or query the users table first."
  }
}
```

### 1. `retryable` 布尔标志

明确告知模型该操作是否值得立即尝试。若由于权限不足（HTTP 403）或资源不存在（HTTP 404），必须标明 `retryable: false`，模型接收到后会立即终止无效循环，转入降级备选分支。

### 2. 字段级校验差分（Schema Diff）

对于结构化参数校验（如 Zod 或 JSON Schema 报错），不能仅回复“参数不合法”。必须精确给出哪个字段（`path`）、收到了什么（`received`）以及期望的合法格式（`expected`）。大模型在接收到具体的差分数据后，能够在单次调用内精确修正该字段。

### 3. 可执行动作指令（Actionable Hint）

指令必须采用明确的动宾短语（如“切换到只读副本”、“先调用 `list_branches` 查询分支”），严禁使用“请确认输入正确”等模棱两可的被动语句。

## 四、验证实验与边界说明

本机制在 `experiments/error-shape-heal/heal.mjs` 中完成了自动化验证：
- 断言 H1：在粗错误码输入下，智能体连续 5 次任务自愈率为 0/5。
- 断言 H2：在注入富错误契约后，智能体在 5 次任务中达成 100% 成功修复，且最多仅耗费 2 轮对话。
- 断言 H3：在仅提供自然语言客套提示（安慰剂）的对照组中，自愈率回落至 0/5，证明了动作指令的决定性。

## 参考资料

- JSON Schema Validation Specifications (<https://json-schema.org/draft/2020-12/json-schema-validation.html>)
- Anthropic User Guide: Best Practices for Tool Use and Error Handling (<https://docs.anthropic.com/en/docs/build-with-claude/tool-use>)
- 站内对照：大模型工具调用契约设计，`/writing/llm-tool-calling-contract`
- 架构演进：确定性 Agent 状态机工程实践，`/writing/ai-backend-08-deterministic-agent-state-machine`
