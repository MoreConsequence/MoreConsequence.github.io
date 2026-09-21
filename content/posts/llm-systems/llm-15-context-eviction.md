---
title: "上下文驱逐看价值不看数量：头尾策略拿走 81% 价值"
description: "20 条 facts 不等价（头指令各 10、中闲聊各 1、尾决策各 5）：截尾价值召回 42%、滑窗 52%、头尾 81%，而计数全是 8/20。用加权模拟证明只数数量选不出策略。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-14"
tags: ["LLM", "上下文", "RAG", "模拟"]
draft: false
featured: false
series: "大模型后端架构与推理加速"
---

**TL;DR：** 上一篇等权版本的结论升级：facts 不等价时（头指令各 10、中闲聊各 1、尾决策各 5，总价值 62），截尾价值召回 42%、滑窗 52%、头尾 **81%**——而三者计数全是 8/20。4 断言全过。选型规则改写：先给内容定价（指令 > 决策 > 闲聊），再选驱逐；只数数量的评测选不出策略。

## 一、为什么等权版是水货标准

等权下三策略都是 8/20——评测区分度为零，等于没测。加权后 42%/52%/81% 拉开差距，策略选择才有依据。教训：**评测的区分度来自价值函数，不来自样本量**。

## 二、实测

`experiments/context-eviction/evict.py`（加权 facts），`evidence/context-eviction/2026-09-14-local/run.out`，4 PASS。

## 三、推理侧的同构答案：H2O 与 attention sink

本文的头尾策略在推理侧有同构物。H2O（arXiv [2306.14048](https://arxiv.org/abs/2306.14048)）发现 attention 分数呈幂律分布：少数 heavy hitters 贡献绝大多数注意力值，驱逐策略于是保留“attention 累积 top + 近期 token”两部分；StreamingLLM（arXiv [2309.17453](https://arxiv.org/abs/2309.17453)）更极端：只留 4 个初始 attention sink（softmax 分母需要锚点）+ 滑窗。本文是它的 prompt 工程版：头指令≈常驻价值（sink），尾决策≈近期价值——同一条“价值不看数量”的规则，在 token 级和 fact 级各实现了一次。

```python
# 实验核心（experiments/context-eviction/evict.py）：价值召回而非计数
VALUES = [10, 10] + [1] * 12 + [5] * 6  # fact-0..19，总价值 62
def value_recall(kept_idx):
    return sum(VALUES[i] for i in kept_idx) / TOTAL
```

## 四、证据卡与边界

合成价值分布（10/1/5 为教学假设），非真实业务权重、不证明真实模型召回。RAG 场景权重来自检索分，另起一篇。

## 参考资料

- PagedAttention（vLLM），<https://arxiv.org/abs/2309.06180>（KV 分页管理的开山做法）
- H2O（heavy hitters + 近期），<https://arxiv.org/abs/2306.14048>；StreamingLLM（attention sink + 滑窗），<https://arxiv.org/abs/2309.17453>
- 前篇：embedding 与检索数学（分块策略），`/writing/llm-embedding-retrieval`；KV cache 显存预算，`/writing/llm-01-kv-cache-paged-attention`
