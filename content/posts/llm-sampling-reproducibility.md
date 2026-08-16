---
title: "采样不是玄学：temperature、top-p、seed 的几何语义"
description: "temperature 缩放 logits、top-p 截长尾、seed 锁 RNG。纯数学模拟还原三个参数的几何作用：T=0 为什么是 argmax 不是低随机，为什么官方文档只说 mostly deterministic。"
publishedAt: "2026-08-16"
tags: ["LLM", "采样", "可复现性"]
draft: false
featured: false
---

**TL;DR：** 三个采样参数各有各的几何语义：temperature 是采样前对 logits 做除法缩放（不是"调随机"的旋钮），而在本文实现里 T=0 走 argmax——所以"温度 0"是确定性路径而非低随机；top-p（核采样）从累积概率达 p 的最小前缀里采样，本模拟中 p=0.9 只保留 28/50 个 token；seed 锁定的是采样器的 RNG 状态——同 seed 同参数产出同序列，但官方文档只承诺 mostly deterministic，因为 GPU 浮点并行归约的顺序不稳定、且模型配置（system_fingerprint）变化会打破复现。**可复现性是个工程承诺，不是数学承诺。**

## 一、 temperature 是 logits 的除法，不是"创造力度"

模型每步输出一个 logits 向量（词表大小的实数），softmax 把它变成概率分布，然后采样。temperature 插在中间：`logits / T`。

模拟一个 50 token 的词表、最优 token 3.2、次优 2.8（`experiments/llm-sampling-reproducibility/sampling_math.py`，workspace Python、NumPy 2.3.5，本机 2026-08-16）：

| T | P(token0) | P(token1) | P(token2) |
| --- | --- | --- | --- |
| 0.5 | 0.577 | 0.259 | 0.019 |
| 1.0 | 0.225 | 0.151 | 0.041 |
| 2.0 | 0.081 | 0.066 | 0.035 |

T 越小分布越尖锐（最优 token 概率从 22.5% 冲高到 57.7%），T 越大越平坦（三个 token 都快均分）。元信息：**T=0 时 `logits/0` 无定义,没有"极小概率"的平滑极限,实现直接走 argmax 分支、RNG 永远不触发。** 所以"温度 0"和"温度 0.1"不是同一机制的两档,前者是贪心解码、后者是采样——工程上两者延迟相同(贪心不少计算),但行为边界不同(贪心不会输给随机)。

## 二、 top-p 是核采样：截掉长尾，重归一化

softmax 之后,概率分布有个长尾：少数 token 占大部分概率质量,其余几千个 token 分享残羹。top-p 的做法：把 token 按概率降序排,取累积概率刚超过 p 的最小前缀,把前缀以外的概率划零、剩余部分重归一化。

实测（同一 logits）：

| p | 保留 token 数 / 50 | token0 占比（重归一化后） |
| --- | --- | --- |
| 0.9 | 28 | 0.248 |
| 0.95 | 36 | 0.236 |
| 1.0 | 50 | 0.225 |

三点工程含义：**① top-p 是过滤器不是缩放器**——它不改变保留候选的相对概率,只改变候选集合,所以和 temperature 同时调会互相抵消(官方建议二者只动其一)；**② p=0.9 已经砍掉 44% 的候选**（28/50），对长尾无意义 token 多的真实词表砍得更多,让采样更稳;**③ 重归一化把头部概率抬起来**（0.225→0.248），语义是"删了长尾,头部就相对更重"。

## 三、 seed：它锁的是什么，不锁什么

seed 是伪随机数生成器的初始状态。同一分布 + 同一 seed → 同一随机序列 → 同一次采样选择：

```
seed=42 ×2 → 序列完全一致 [27, 2, 38, 17, 0, 48, 25, 27]
seed=7      → [13, 40, 27, 1, 1, 39, 0, 31]（不同）
```

但把"同 seed 同输出"当成绝对确定性是危险的。OpenAI 官方文档原文是"mostly deterministic"，并给出两个打破因素：

1. **GPU 浮点的不可结合性**：logits 是并行归约出来的,浮点加法不满足结合律,执行序微差 → logits 尾位抖动 → 两个接近的候选在 argmax 时可能翻转。这是 T>0 和 T=0 都存在的:贪心路径上被翻转的是"谁拿第一"。
2. **system_fingerprint 变化**：官方把它定义为"模型配置的指纹",内部横滚更新会改变输出分布——即使 seed 相同。**可复现性断了不是 bug,是模型在变。**

两个工程推论：同 seed 同参数的两次调用只在短期内大概率同输出;跨天、跨发布的"复现"不能依赖 seed。要可复现测试,该锁的是**输入快照 + 模型版本 + 采样参数 + 允许的差异容忍度**,而不是 seed 本身。

## 四、 结论：把"随机性"当工程变量管理

- T 是分布形状,top-p 是候选集,seed 是 RNG 种子——三个独立维度,别混用,官方建议二选一。
- 结构化输出场景（JSON、工具调用参数）用 T=0 + schema 约束,不是调低 T 得到的"更稳",是切换到确定性路径。
- 要复现测试,记录 `temperature + top_p + seed + model + system_fingerprint` 五元组,而不是只记 seed。
- 采样参数的语义是纯数学的,和模型无关——你可以在本地用任意 logits 向量推演行为,这就是本实验可复现的原因。

下一步：给 Agent 的每次调用在日志里落一个"采样五元组"。下次"上次一样的输入怎么输出不一样"的排查,先看 fingerprint 是否变了。

## 参考资料

1. OpenAI Cookbook：How to make your completions outputs consistent with the new seed parameter（seed、mostly deterministic 与 system fingerprint，2026-08-16 核对）：https://cookbook.openai.com/examples/reproducible_outputs_with_the_seed_parameter
2. Microsoft Learn：Azure OpenAI 参数说明（temperature、top_p 与核采样边界）：https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
3. 纯数学模拟：`experiments/llm-sampling-reproducibility/sampling_math.py`；本机原始输出与环境快照：`evidence/llm-sampling-reproducibility/2026-08-16-local/`。
