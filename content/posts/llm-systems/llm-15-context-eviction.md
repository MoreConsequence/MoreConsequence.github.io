---
title: "LLM 上下文驱逐机制与价值函数：从等权计数到头尾注意力保留"
description: "上下文窗口溢出时如何优雅淘汰？本文深入拆解等权截断评测的失真陷阱，建立加权信息价值函数，实测截尾（42%）、滑窗（52%）与头尾保留（81%）的召回差异，并映射至 StreamingLLM 与 H2O 显存管理机制。"
publishedAt: "2026-09-14"
updatedAt: "2026-10-22"
tags: ["LLM", "上下文窗口", "KV Cache", "StreamingLLM", "系统优化"]
draft: false
featured: false
series: "大模型后端架构与推理加速"
---

**TL;DR：** 面对超出模型上下文窗口的长会话，许多工程团队采用简单的固定滑动窗口或截断最近对话。这类策略在“等权计数”的粗放视角下看似都保留了相同数量的 Token，但在真实业务场景中信息价值极度不均等。以包含 20 条关键事实的典型会话为例：前置系统指令赋予最高权重（各 10 分），中段闲聊琐碎信息权重极低（各 1 分），尾部最新用户决策权重较高（各 5 分）。在相同保留 8 条事实的预算下，传统截尾策略的价值召回率仅为 41.9%，纯滑动窗口仅为 51.6%，而同时锚定前置指令与最新决策的**头尾保留策略**（Head-Tail Strategy）能够一举斩获 **80.6%** 的核心信息价值。这在 Prompt 工程层面与推理引擎底层的 StreamingLLM 注意力池（Attention Sink）与 H2O 重度击中者策略实现了架构同构。

## 一、为什么“数 Token”选不出优秀淘汰策略

当多轮对话或大模型代理（Agent）的上下文长度逼近上下文上限（Context Limit）时，系统必须触发淘汰机制（Eviction）。
过去评估淘汰算法时，常见的做法是统计保留率：
“原本有 20 条消息，淘汰后剩下 8 条，压缩率统一为 40%。”

这种无视内容重要性的等权计数，本质上将“系统提示词中的防御原则”与“用户中间的一句客套问候”画上了等号。
在等权视角下，无论是保留前 8 条、后 8 条还是随机抽样 8 条，评测得分完全一致，导致架构决策彻底失明。

## 二、价值函数建模与三种驱逐策略对照

为了量化真实的上下文价值，必须根据信息生命周期建立价值分布模型：

```text
会话上下文时间轴 (共 20 项，总价值 = 62):
  [项 0, 1] ─── 系统核心指令 / 角色约束 / 权限边界 (高密度，单项价值 = 10)
      │
  [项 2 ~ 13] ── 中途问答过程 / 工具调用杂质 / 寒暄客套 (低密度，单项价值 = 1)
      │
  [项 14 ~ 19] ─ 用户最新决策 / 任务参数变更 / 即时诉求 (高时效，单项价值 = 5)
```

假设显存或 Token 预算仅允许保留 8 项内容，系统面临三种淘汰策略的抉择：

```text
策略 1: 截尾淘汰 (FIFO / Truncation)
  保留前 8 项 [0 ~ 7]:
  包含系统指令 (20) + 早期杂质 (6) = 26 分 ──> 价值召回率仅 41.9%
  (严重后果: 用户最新的关键变更被无情抹去，模型答非所问)

策略 2: 滑动窗口 (Sliding Window)
  保留后 8 项 [12 ~ 19]:
  包含近期杂质 (2) + 最新决策 (30) = 32 分 ──> 价值召回率仅 51.6%
  (严重后果: 系统提示词丢失，模型发生越狱或忘记自身角色与输出格式)

策略 3: 头尾保留 (Head-Tail Attention Sink)
  锚定头部 2 项 + 滑动尾部 6 项 [0, 1] + [14 ~ 19]:
  包含完整系统指令 (20) + 全部最新决策 (30) = 50 分 ──> 价值召回率高达 80.6%!
  (零额外开销下，核心决策上下文召回提升近一倍)
```

| 淘汰策略 | 保留条目数 | 丢弃的内容 | 核心风险 | 价值召回率 |
| --- | --- | --- | --- | --- |
| 传统截尾（FIFO） | 8 / 20（40%） | 尾部最新对话 | 遗忘用户最新需求，决策失效 | 41.9% |
| 纯滑动窗口 | 8 / 20（40%） | 头部系统指令 | 丢失系统 Prompt 与格式约束 | 51.6% |
| 头尾保留（Head-Tail） | 8 / 20（40%） | 中段低价值交互 | 丢失部分中间对话历史 | **80.6%** |

## 三、底层推理引擎的同构演进：从 StreamingLLM 到 H2O

头尾策略不仅适用于应用层 Prompt 编排，更是底层 GPU 推理引擎治理 KV Cache（键值缓存）显存墙的开创性思想。

### 1. StreamingLLM：注意力池（Attention Sink）的数学必然

2023 年 MIT 与 Meta 提出的 StreamingLLM（arXiv:2309.17453）破解了长文本推理崩溃之谜：
如果对 KV Cache 采用纯滑动窗口，当窗口滑过序列开头的第 1 到第 4 个 Token 时，大模型的困惑度（Perplexity）会瞬间暴涨上千倍，模型输出彻底沦为胡言乱语。

论文发现：由于 Softmax 计算的分母特性，自注意力层倾向于将不成比例的巨大注意力权重倾泻在序列前部的初始 Token 上（即 Attention Sink，注意力汇）。
只要在 KV 缓存中**永久锁定前 4 个初始 Token（无论窗口多长绝不驱逐）**，并结合尾部滑动窗口，大模型即可在无限长文本流中稳定推理，且不产生任何困惑度发散。

### 2. H2O：Heavy Hitter Oracle 幂律淘汰

H2O 算法（arXiv:2306.14048）进一步揭示了注意力累积的幂律分布：只有极少部分的 Token（被称为 Heavy Hitters，重度击中者）在生成过程中持续被关注，其余大量 Token 在生成一两步后便极少再被引用。
通过动态跟踪累积注意力分数，H2O 将显存优先分配给“累积注意最高值 + 最近局部邻域”，以 20% 的 KV Cache 显存消耗复现了全量上下文 95% 以上的精度。

## 四、生产级 Prompt 压缩与上下文编排实现

在应用层，开发者可直接运用头尾保留模型构建长会话管理器：

```ts
interface ContextItem {
	role: "system" | "user" | "assistant";
	content: string;
	priority: "high" | "low" | "critical";
}

function evictContext(items: ContextItem[], maxBudget: number): ContextItem[] {
	if (items.length <= maxBudget) return items;

	// 1. 提取头部系统提示词 (固定锁定，绝不驱逐)
	const head = items.filter((it) => it.role === "system");
	const remainingBudget = maxBudget - head.length;

	// 2. 剩余配额从尾部向前截取最新会话
	const nonSystem = items.filter((it) => it.role !== "system");
	const tail = nonSystem.slice(-remainingBudget);

	// 3. 组装具备高价值保留的最终上下文列表
	return [...head, ...tail];
}
```

结合结构化摘要（Summary Injection），系统在中段对话被淘汰前将其异步压缩为一两句全局背景摘要追加到头部，即可在维持高召回率的同时，彻底消除长会话的 Token 溢出风险。

## 五、验证实验与边界说明

本机制在 `experiments/context-eviction/evict.py` 中通过离散事实价值模型完成了仿真验证：
- 断言 E1：传统截尾淘汰在相同 8 槽位限制下，价值召回率仅为 0.419。
- 断言 E2：纯滑动窗口策略排除了头部指令后，价值召回率为 0.516。
- 断言 E3：头尾联合保留策略以 0.806 的召回率胜出，证明其信息捕获效率。
- 断言 E4：确认了三类策略在计数层面均为 8/20，直接证明了传统计数评测的盲区。

## 参考资料

- Guangxuan Xiao et al., 2023. "Efficient Streaming Language Models with Attention Sinks", arXiv:2309.17453
- Zhenyu Zhang et al., 2023. "H2O: Heavy Hitter Oracle for Efficient Generative Inference of Large Language Models", arXiv:2306.14048
- Woosuk Kwon et al., 2023. "Efficient Memory Management for Large Language Model Serving with PagedAttention", SOSP '23
- 站内对照：大模型评测与 CI 发布门禁设计，`/writing/llm-12-eval-estimation-gates`
- 架构演进：Embedding 语义召回与长文本数学边界，`/writing/llm-embedding-retrieval`
