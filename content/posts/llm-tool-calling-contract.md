---
title: "给模型写的 API：错误形状决定 Agent 能不能自愈"
description: "同一个工具调用失败，错误 body 的三种形状让 Agent 的成功率从 0% 到 100%。用确定性模拟还原：裸错误只能盲重试、有码能区分重试型与修正型、有 details.path 才能一轮修对。"
publishedAt: "2026-08-16"
tags: ["LLM", "API 设计", "Agent"]
draft: false
featured: false
---

**TL;DR：** Agent 调用你的 API 时，错误响应就是它的"输入信号"——信号的信息量直接决定下一轮动作的质量。确定性模拟（不依赖真实模型）显示同一失败用三种错误形状返回：裸错误（500 + 空 body）下 Agent 盲重试 5 轮后 0% 成功率、浪费 3000 token；只给 `{code, message}` 时能区分"重试型/修正型"，成功率 100% 但要多花 4 轮；带上 `details: [{path, code, message}]` 把错误定位到具体字段时，Agent 一轮修对，token 省一半（2400→1200）。**结论：给模型写 API 时，错误的形状比成功响应的形状更重要——它是 Agent 的决策输入。** 本系列 service-api-shape 的契约恰好是这个形状。

## 一、 Agent 没有"人类直觉"：错误响应就是它唯一的信息源

人类调 API 失败时会看状态码、翻日志、猜字段名。Agent 做不到——它唯一的输入是工具返回的字符串（或结构化对象）。错误的形状决定了它的下一轮动作空间：

- **只有状态码**：不管是 500 还是 422，对模型来说都是"失败"。它不知道这错误是重试能解决的（网络抖动）还是重试永远解决不了的（参数非法）。
- **有 code**：能区分"重试型"（5xx 语义）和"修正型"（4xx 语义），至少不会对着参数错误死磕重试。
- **有 details.path**：连错在哪个字段都知道，直接改对字段，不需要试探。

## 二、 模拟：同一次失败，三种形状，行为差距

用确定性模拟器复现（`experiments/llm-tool-calling-contract/simulate.mjs`，本机 2026-08-16）：同样的"下单"工具，库存不足导致失败，Agent 每次调用固定花 500 输入 + 100 输出 token，最多 5 轮：

| 错误形状 | 决策能力 | 成功率 | 平均轮数 | 平均 token |
| --- | --- | --- | --- | --- |
| 裸错误（500+空 body） | 只能盲重试，永远用同一参数 | 0% | 5.0 | 3000 |
| `{code, message}` | 知道是修正型，换参数试探 | 100% | 4.0 | 2400 |
| `{code, message, details[path]}` | 定位到 qty 字段，直接修对 | 100% | 2.0 | 1200 |

模拟的机制设计很保守：**结构化形状的成功不是"模型聪明"，而是信号给了它足够信息做最优动作**。真实模型的成功率只会更好（它有训练先验），但形状的信息量上限是结构性的——裸错误下再聪明的模型也只能猜。

两个数字值得细看：

1. **成功率 0% vs 100% 的分界线在 code，不在 message**。半结构化型号 100% 成功不是因为 message 写得好，而是 code（`STOCK_NOT_ENOUGH` vs `INVALID_QTY` 语义不同）让模拟能分流到不同动作。message 是给人看的，code 才是给模型看的。
2. **details.path 省掉的是"试探轮次"**。半结构化要 4 轮：试参数→失败→再试→再失败→成功。结构化 2 轮：读细节→直接修。400 行模拟代码没有一行魔法，纯粹是信息量递减（4→2 轮，token 减半）。

## 三、 设计原则：三种错误各就各位

从模拟反推的契约设计原则，正好对应服务系列落库的订单契约（`experiments/service/src/orders.ts`）：

```
{ error: { code, message, details?: [{ path, code, message }] } }
```

- **code 用枚举不用自由文本**：`ORDER_NOT_FOUND` / `INVALID_QTY`，全局唯一。模型对枚举的分流能力远强于对自然语言的分流（可预测、可判等）。
- **details.path 指向字段，不指向"用户操作"**：Agent 能修的是参数不是用户，所以错误必须定位到 `["qty"]` 这种它可控的位置。`details: [{path: ["qty"], code: "EXCEEDS_STOCK", message: "库存仅 2 件"}]` 让模型知道：把 qty 改小。
- **5xx 永远带重试语义，4xx 永远带修正语义**：模型的分流依赖这个不变量。如果 400 有时是重试型有时是修正型，模型无法学习，又退回盲重试。
- **错误也是 token 成本**：details 写太长会吃掉输入预算（首篇 token 经济学算过账）。目标是"够模型做决策"——path+code+一行 message，不是把整个字段校验失败列表全塞进去。

## 四、 结论：错误契约是 Agent 应用的第一份接口文档

- 给模型调用的 API，错误形状决定自愈能力：无 code 盲重试（0%），有 code 分流（100%），有 path 省一半 token。
- 契约落库优于口头规范：`{error: {code, message, details[]}}` 写成 zod schema + 全局错误码枚举，新工具天然继承。
- 别把错误契约当"给人看的文案"设计：code 的语义（重试型/修正型）比 message 的措辞重要得多。

下一步：把你现有工具的错误响应翻一遍——没有 code 枚举的补上，4xx 全带 details.path。然后给 Agent 加一个"错误码分流"的单元测试：模拟三种形状，断言轮数与成功率，把这个实验挂进 CI。

---

## 参考资料

1. RFC 9457：Problem Details for HTTP APIs（错误对象的通用结构）：https://www.rfc-editor.org/rfc/rfc9457
2. RFC 9110：HTTP Semantics（4xx/5xx 状态码的语义边界）：https://www.rfc-editor.org/rfc/rfc9110
3. 错误形状模拟：`experiments/llm-tool-calling-contract/simulate.mjs`；本机 raw 与环境：`evidence/llm-tool-calling-contract/2026-08-16-local/`。
4. 订单服务错误合同：`experiments/service/src/orders.ts`；模拟为确定性启发式，不冒充真实模型行为。
