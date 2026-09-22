---
title: "面向后端工程师的 AI 架构与工程实战（十三）：投机采样与推测解码的高并发工业落地"
description: "深度剖析投机采样（Speculative Decoding）从数学原理到工业级推理引擎（vLLM/SGLang）落地的全过程：打破自回归解码的显存带宽瓶颈、无损修正拒绝采样的严密数学证明、从线性链式投机到 Medusa/Eagle 树状注意力拓扑、以及高并发吞吐倒挂下的自适应退火流控架构。"
publishedAt: "2026-06-23"
draft: false
featured: false
tags:
  - "AI Engineering"
  - "Speculative Decoding"
  - "vLLM"
  - "Inference Serving"
  - "GPU Optimization"
  - "Systems"
---

> **TL;DR：**
> 大语言模型推理存在严酷的物理瓶颈：在自回归生成（Decode）阶段，每次前向传播只能产出 1 个 Token，却必须将数十上百 GB 的模型权重完整搬运一次，系统处于极低计算访存比（Arithmetic Intensity $\approx 1\text{ FLOP/Byte}$）的显存带宽受限（Memory-Bound）状态。**投机采样（Speculative Decoding）**通过“小模型（Draft Model）轻量猜测 + 大模型（Target Model）单次前向并行验证”的协同范式，打破了这一单步串行枷锁。
>
> 本文深入剖析投机采样的底层机制：
> 1. **物理瓶颈**：自回归 Decode 的带宽墙与 Prefill 的算力墙差异。
> 2. **数学保证**：修正拒绝采样（Modified Rejection Sampling）如何严格无损还原目标模型的概率分布 $P(x)$。
> 3. **架构演进**：从朴素双模型链式投机，演进至 Medusa 多头投机与 Eagle 隐藏状态推测，再到树状注意力（Tree Attention）拓扑验证。
> 4. **工业陷阱**：高并发批处理（Batch Size $\ge 64$）下的算力-带宽反转与吞吐倒挂现象，以及企业级自适应退火流控策略。

> **系列架构体系导航**：
> 本文属于《面向后端工程师的 AI 架构与工程实战》系列第十三篇。
> - 全局架构蓝图与体系定位：参见 [《第 00 篇：构建确定性企业级 AI 系统的全局工程蓝图》](/writing/ai-backend-00-architecture-blueprint)
> - 所属分层定位：**第 1 层：协议转换与流式接入层（Protocol & Streaming Ingress）及底层推理引擎优化**
> - 上游协同：配合 [《第 02 篇：流式网关与 SSE 背压》](/writing/ai-backend-02-streaming-gateway-sse-backpressure) 降低端到端输出延迟（ITL / TTFT）
> - 核心工程使命：打破自回归 Decoding 阶段的 Memory Bandwidth Bound，在保持严格输出数学分布无损的前提下实现 2x~3x 的推理延迟加速，并解决高并发场景下的计算带宽反转难题。

---

## 1. 物理本质：自回归解码为何撞上“显存带宽墙”？

在开发传统高并发后端服务（如订单处理、实时通讯）时，系统的性能瓶颈通常集中在网络 I/O、磁盘 I/O 或数据库锁争用。但在大模型推理系统中，工程师面临着完全不同的物理定律：**Roofline 计算模型**。

```
算力上限 (PetaFLOPS)
  ^
  |                          Peak Compute Limit (算力受限区 - Prefill 阶段)
  |                     +---------------------------------------
  |                    /
  |                   / 
  |                  /  斜率 = 显存带宽 (TB/s)
  |                 /
  |                /   Memory Bandwidth Limit (显存带宽受限区 - Decode 阶段)
  |               /
  |              /
  |             /
  +------------+---------------------------------------------> 计算访存比 (FLOPs/Byte)
              ^
        拐点 (Operational Intensity Threshold)
```

### 1.1 计算访存比（Arithmetic Intensity）的断崖下跌

对于一个包含 $P$ 个参数的 Transformer 模型，以 FP16（2 字节/参数）存储：
- **Prefill 阶段（输入处理）**：输入 Prompt 包含 $N$ 个 Token。矩阵乘法 $X \times W$ 是 `GEMM`（通用矩阵乘法）。FLOPs 约为 $2 \times N \times P$，显存读取量为模型权重 $2P$。
  $$\text{Arithmetic Intensity}_{\text{prefill}} \approx \frac{2 \times N \times P}{2P} = N \text{ FLOP/Byte}$$
  当 $N = 2048$ 时，计算访存比高达 $2048\text{ FLOP/Byte}$，充分填满 NVIDIA H100 GPU 核心的 Tensor Core，系统处于**计算受限（Compute-Bound）**状态。

- **Decode 阶段（自回归生成）**：每一步仅输入上一步生成的 $1$ 个 Token，此时矩阵运算退化为 `GEMV`（通用矩阵向量乘法）。FLOPs 为 $2 \times 1 \times P$，显存依然必须从全局显存（HBM3）中把整整 $2P$ 字节的权重全量读取一遍到片上高速缓存（SRAM）。
  $$\text{Arithmetic Intensity}_{\text{decode}} \approx \frac{2 \times 1 \times P}{2P} = 1 \text{ FLOP/Byte}$$

### 1.2 延迟极限定理：以 70B 模型与 H100 为例

考虑目前工业界广泛部署的 LLaMA-3-70B（FP16 模式下权重约 $140\text{ GB}$），运行在单张或两张 NVIDIA H100（单卡 HBM3 带宽约为 $3.35\text{ TB/s}$）：
若并发 Batch Size 为 1，生成 1 个 Token 的物理最低耗时由搬运 $140\text{ GB}$ 权重的带宽决定：
$$T_{\text{step}} \ge \frac{140\text{ GB}}{3.35\text{ TB/s}} \approx 41.79\text{ ms}$$
这意味着在不考虑网络与调度损耗的绝对理想情况下，单流生成速度上限仅为：
$$\text{TPS} = \frac{1000\text{ ms}}{41.79\text{ ms}} \approx 23.9\text{ Tokens/s}$$
在这个过程中，**GPU 上算力高达近 1000 TFLOPS 的计算单元有超过 95% 的时间处于等待显存数据加载的空转饥饿状态**。

---

## 2. 投机采样的核心范式：异步两阶段验证

为了打破这一带宽物理锁，Leviathan 与 Chen 等人在 2023 年独立提出了**投机采样（Speculative Decoding）**。其核心洞察是：
> 大模型在验证多个 Token 时是并行 Prefill（Compute-Bound），其耗时几乎与生成单个 Token 相同；如果让一个极其廉价的小模型先“投机猜测”几个 Token，再让大模型“一眼扫过”全量校验，就能用多余的算力换取时间。

```
========================================================================================
传统自回归 (耗时 = 4 * T_large)
Step 1: [Large 70B] -> 生成 t1 (耗时 40ms)
Step 2: [Large 70B] -> 生成 t2 (耗时 40ms)
Step 3: [Large 70B] -> 生成 t3 (耗时 40ms)
Step 4: [Large 70B] -> 生成 t4 (耗时 40ms)
总耗时: 160ms (产出 4 个 Token)
========================================================================================
投机解码架构 (耗时 = 3 * T_small + 1 * T_large)
Stage 1 (Drafting):
  [Small 1B] -> 生成 t1 (4ms) -> 生成 t2 (4ms) -> 生成 t3 (4ms)   [耗时 12ms]
Stage 2 (Verification):
  [Large 70B] -> 单次前向验证 [t1, t2, t3] 并预测下一位 t4        [耗时 42ms]
总耗时: 54ms (若全部接受，产出 4 个 Token，加速比 2.96x！)
========================================================================================
```

### 系统核心三角色：
1. **草稿模型（Draft Model, $M_q$）**：参数量极小（如 1B~8B），显存占用仅为目标模型的 5%~10%，以极致的单步低延迟快速吐出 $K$ 个候选 Token。
2. **目标模型（Target Model, $M_p$）**：参数量巨大（如 70B~405B），作为质量基准。在单次 Forward 过程中，同时接收前缀及 $K$ 个草稿 Token，利用因果自注意力机制并行计算出这 $K$ 个位置的真实条件概率。
3. **裁决器（Arbitration Engine）**：基于目标模型和草稿模型的概率分布，执行无损拒绝采样，输出被接受的 Token 序列以及首个分歧点的替补 Token。

---

## 3. 数学严密性证明：修正拒绝采样（Modified Rejection Sampling）

很多工程师对投机采样的第一反应是：“小模型水平这么差，猜出的 Token 会不会降低大模型的推理质量甚至引起幻觉？”
答案是：**绝对不会。在数学上，投机采样能证明其输出的联合概率分布与直接从大模型中自回归采样 100% 严格同分布。**

### 3.1 采样算法流程

设当前上下文为 $x_{<t}$，草稿模型预测的候选 Token 为 $\tilde{x} \sim Q(x)$，目标模型在该位置的真实概率分布为 $P(x)$：

```
                              [ 草稿 Token x ~ Q(x) ]
                                         |
                                         v
                         +-------------------------------+
                         | 计算接受概率:                  |
                         | alpha = min(1, P(x) / Q(x))   |
                         +-------------------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
              [ 掷随机数 u ~ U(0,1) ]             [ 掷随机数 u ~ U(0,1) ]
                  若 u <= alpha                       若 u > alpha
                       |                                   |
                       v                                   v
               [ 接受草稿 Token x ]              [ 拒绝！终止本轮后续草稿 ]
                       |                                   |
                       v                                   v
             继续验证下一个草稿 Token          从修正残差分布 P'(x) 采样新 Token
                                               并重置 KV Cache
```

残差修正分布 $P'(x)$ 的定义为：
$$P'(x) = \frac{\max(0, P(x) - Q(x))}{\sum_{y \in \mathcal{V}} \max(0, P(y) - Q(y))}$$

### 3.2 概率等价性证明

我们要证明：无论小模型分布 $Q(x)$ 如何畸变，最终采纳 Token $x$ 的边际概率 $P_{\text{final}}(x)$ 恒等于目标模型概率 $P(x)$。

**证明：**
最终采纳 Token $x$ 的概率包含两部分互斥事件：
1. 草稿模型采样出了 $x$（概率为 $Q(x)$），且被目标模型接受（概率为 $\min\left(1, \frac{P(x)}{Q(x)}\right)$）。
2. 草稿模型采样出的 Token 被拒绝，随后在残差分布 $P'(x)$ 中重新采样到了 $x$。

记草稿被拒绝的总概率为 $R$：
$$R = 1 - \sum_{y \in \mathcal{V}} Q(y) \min\left(1, \frac{P(y)}{Q(y)}\right) = 1 - \sum_{y \in \mathcal{V}} \min(Q(y), P(y))$$

由于对于任意实数有 $a - \min(a, b) = \max(0, a - b)$，且 $\sum_y P(y) = 1$：
$$R = \sum_{y \in \mathcal{V}} P(y) - \sum_{y \in \mathcal{V}} \min(Q(y), P(y)) = \sum_{y \in \mathcal{V}} \max(0, P(y) - Q(y))$$

注意看，这个拒绝概率 $R$ 恰好等于残差分布 $P'(x)$ 的归一化分母！

现在计算最终输出 $x$ 的边际概率：
$$\begin{aligned}
P_{\text{final}}(x) &= Q(x) \min\left(1, \frac{P(x)}{Q(x)}\right) + R \cdot P'(x) \\
&= \min(Q(x), P(x)) + R \cdot \frac{\max(0, P(x) - Q(x))}{R} \\
&= \min(Q(x), P(x)) + \max(0, P(x) - Q(x))
\end{aligned}$$

根据恒等式 $\min(a, b) + \max(0, b - a) = b$：
$$P_{\text{final}}(x) = P(x) \quad \forall x \in \mathcal{V}$$

**证毕。**
这意味着，即使你使用一个随机乱猜的草稿模型，输出的文本在统计分布上也与原始 70B 模型毫无二致（仅退化为加速比为 1，甚至因额外开销略微变慢），绝不损失任何精度。

---

## 4. 工业级推测解码的架构演进

在实际部署中，单纯的“单链双模型”面临显存管理复杂度高、跨模型词表（Vocab）不一致等挑战。工业界先后诞生了三种核心变体：

```
+---------------------------------------------------------------------------------------+
| 方案演进与架构对比                                                                     |
+--------------------+----------------------------+-------------------------------------+
| 模式               | 拓扑结构                   | 核心特征与优缺点                    |
+--------------------+----------------------------+-------------------------------------+
| 1. 经典独立草稿模型 | 独立 1B/8B 小模型           | + 零架构侵入性，即插即用            |
| (Independent Draft)| (两套独立的权重与引擎)      | - 需分配额外 GPU 显存，词表映射损耗 |
+--------------------+----------------------------+-------------------------------------+
| 2. Medusa 多头投机  | 主模型顶部外挂多个 MLP 头   | + 零额外模型加载，共享隐藏状态      |
| (Multi-Head Heads) | (Head 1, Head 2, ..., Head K)| - 头部独立预测无因果依赖，准确率衰减|
+--------------------+----------------------------+-------------------------------------+
| 3. Eagle 特征外推  | 自回归轻量 Transformer Head | + 引入上一层隐藏状态特征，接受率极高|
| (Feature Recurrent)| (接收上层 Hidden States)   | + 工业级 vLLM / SGLang 首选主流     |
+--------------------+----------------------------+-------------------------------------+
```

### 4.1 树状注意力（Tree Attention / SpecInfer）

在线性投机中，一旦第 2 个 Token 被拒绝，后续猜测的第 3、第 4 个 Token 哪怕猜得再准也只能全部作废。
为了最大化单次验证的利用率，现代推理引擎将草稿组织为**前缀树（Prefix Tree）**拓扑：

```
                  [ Root (当前前缀) ]
                     /           \
                 t1_A (p=0.7)    t1_B (p=0.3)
                 /        \           \
            t2_A1(0.8)  t2_A2(0.2)   t2_B1(0.9)
```

在 Target Model 中进行单次 Forward 时，如何同时验证这些分支互不干扰？答案是构建**非对称 2D 树状注意力掩码（Tree Attention Mask）**：

```
Mask 矩阵 (1 表示可关注，0 表示遮蔽):
          Root  t1_A  t2_A1  t2_A2  t1_B  t2_B1
Root   [   1     0      0      0     0      0   ]
t1_A   [   1     1      0      0     0      0   ]
t2_A1  [   1     1      1      0     0      0   ]  <-- 只能看到 Root 和自己的祖先 t1_A
t2_A2  [   1     1      0      1     0      0   ]  <-- 只能看到 Root 和 t1_A，看不到兄弟 t2_A1
t1_B   [   1     0      0      0     1      0   ]
t2_B1  [   1     0      0      0     1      1   ]  <-- 只能看到 Root 和 t1_B
```
通过构造定制化的 2D Attention Mask 与位置编码（Positional Encoding），目标模型可以在**完全相同的时间开销下，同时校验多个可能的分支**，一旦主干被拒，可以立即回退到高概率的侧枝。

---

## 5. 生产级 Python 算法实现：无损投机采样内核

以下代码展示了符合工业规范的修正拒绝采样核心逻辑（含多候选接受校验与分布对齐）：

```python
import torch
import torch.nn.functional as F
from typing import Tuple, List, Optional

class SpeculativeDecoderKernel:
    """
    工业级推测解码核心仲裁器 (Modified Rejection Sampling)
    保证输出分布与 target_model 完全同分布 (Lossless Distribution)
    """
    def __init__(self, temperature: float = 1.0, top_p: float = 1.0):
        self.temperature = max(temperature, 1e-5)
        self.top_p = top_p

    def _apply_sampling_transforms(self, logits: torch.Tensor) -> torch.Tensor:
        """应用温度缩放与 Top-P 过滤，输出概率分布向量"""
        scaled_logits = logits / self.temperature
        
        if self.top_p < 1.0:
            sorted_logits, sorted_indices = torch.sort(scaled_logits, descending=True)
            cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
            
            # 移除阈值以外的 logits
            sorted_indices_to_remove = cumulative_probs > self.top_p
            sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
            sorted_indices_to_remove[..., 0] = 0
            
            indices_to_remove = sorted_indices_to_remove.scatter(
                dim=-1, index=sorted_indices, src=sorted_indices_to_remove
            )
            scaled_logits = scaled_logits.masked_fill(indices_to_remove, -float("inf"))

        return F.softmax(scaled_logits, dim=-1)

    def verify_draft_sequence(
        self,
        draft_tokens: torch.Tensor,            # [K] 草稿 Token 序列
        draft_probs: torch.Tensor,             # [K, Vocab] 草稿模型预测分布 Q
        target_logits: torch.Tensor,           # [K + 1, Vocab] 目标模型一次前向所得 Logits P
    ) -> Tuple[List[int], bool]:
        """
        仲裁草稿序列
        :return: (accepted_tokens, all_accepted_flag)
        """
        K = draft_tokens.size(0)
        assert draft_probs.size(0) == K
        assert target_logits.size(0) == K + 1

        accepted_tokens: List[int] = []
        target_probs = self._apply_sampling_transforms(target_logits) # [K + 1, Vocab]

        for i in range(K):
            token_id = draft_tokens[i].item()
            q_val = draft_probs[i, token_id].item()
            p_val = target_probs[i, token_id].item()

            # 计算接受阈值 alpha = min(1, P(x) / Q(x))
            alpha = min(1.0, p_val / max(q_val, 1e-9))
            u = torch.rand(1).item()

            if u <= alpha:
                # 命中接受：将候选 Token 纳入最终序列
                accepted_tokens.append(token_id)
            else:
                # 拒绝发生！从修正残差分布采样：max(0, P - Q) / sum(max(0, P - Q))
                residual = torch.clamp(target_probs[i] - draft_probs[i], min=0.0)
                residual_sum = torch.sum(residual)

                if residual_sum > 1e-9:
                    normalized_residual = residual / residual_sum
                    recovered_token = torch.multinomial(normalized_residual, num_samples=1).item()
                else:
                    # 极小边缘兜底，回退到目标模型全分布采样
                    recovered_token = torch.multinomial(target_probs[i], num_samples=1).item()

                accepted_tokens.append(recovered_token)
                return accepted_tokens, False

        # 如果前 K 个 Token 全部被接受，用第 K+1 个位置的 logits 奖励一个生成 Token
        bonus_token = torch.multinomial(target_probs[K], num_samples=1).item()
        accepted_tokens.append(bonus_token)
        return accepted_tokens, True
```

---

## 6. 高并发吞吐倒挂之谜：工业落地的关键权衡

许多团队在测试投机采样时，往往在测试机单请求压测下测出 **2.5x 甚至 3.0x 的惊人加速**，但一旦直接上线生产网关并承受真实洪峰，却惊愕地发现：**总吞吐量（Throughput Tokens/s）暴跌了 30%~50%，系统负载直接红线崩盘！**

为什么会出现“单请求延迟显著降低，整体系统吞吐严重倒挂”的怪现状？

```
吞吐量 (Tokens/sec)
  ^
  |                          /  传统自回归 (连续动态 Batching 极限压榨)
  |                         /
  |                        /
  |                       /
  |                      /    <-- 交叉拐点 (Critical Batch Size: 约 32~64)
  |      +--------------+
  |     /              /
  |    /              /   <-- 投机解码在高并发下出现吞吐倒挂！
  |   /              /
  |  /              /
  +--+-------------+---------------------------------------------> 批处理并发 (Batch Size)
  单流极速          高并发吞吐受损
 (Latency-bound)   (Compute/Memory-saturated)
```

### 6.1 吞吐倒挂的三大物理成因

1. **计算特性的动态反转**：
   - 当系统并发很低（$BS = 1 \sim 4$）时，显卡极度缺乏算力负荷，处于显存带宽瓶颈。此时白嫖算力做并行校验是“划算的”。
   - 当并发大幅提升（$BS \ge 64$）时，连续批处理（Continuous Batching）已经将大模型的每一步运算推向了**计算受限区（Compute-Bound）**！此时 Tensor Cores 已经 100% 满负荷。让大模型同时验证 $K$ 个 Token 会直接占用双倍甚至三倍的矩阵计算量，导致其他正在排队的请求排队等待时间成倍拉长。
2. **KV Cache 内存膨胀与挤占**：
   - 投机解码为了验证树状或线性分支，必须预先为尚未确定接受的候选 Token 预分配 PagedAttention 物理块（Physical Blocks）。这大幅降低了显存中有效并发请求的承载上限，引发频繁的 KV Cache 驱逐（Swap-out）或重计算（Preemption）。
3. **Draft 模型本身的调度税（Scheduling Overhead）**：
   - 运行小模型同样需要 GPU Kernel 启动开销、CUDA Graph 切换和进程间通信同步。在高负载下，这些微秒级开销累积成不可忽视的调度停顿。

---

## 7. 生产级架构防线：自适应退火流控策略

在企业级 AI 推理架构（vLLM / SGLang 网关）中，不能机械地“一刀切”开启投机解码，必须建立一套根据**显卡实时算力热度与上下文特征动态调整的自适应控制器（Adaptive Speculation Controller）**：

```
                                  [ 入站推理请求 ]
                                         |
                                         v
                         +-------------------------------+
                         |   自适应控制器 (Controller)   |
                         | 采集指标:                     |
                         | - 当前 Batch Size / 队列深度  |
                         | - GPU Tensor Core 负载率      |
                         | - 请求 Prompt 熵值 (代码/创意)|
                         +-------------------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
         [ 负载空闲 或 强交互低延迟 SLA ]       [ 负载饱和 或 离线批量任务 ]
                       |                                   |
                       v                                   v
             [ 启用投机解码引擎 ]                 [ 动态降级：纯自回归解码 ]
                       |                                   |
                       v                                   v
              动态调节草稿长度 K:                     最大化 GPU 矩阵计算吞吐
              - 命中率高: K = 5                       避免 KV Cache 内存碎片
              - 命中率低: K 衰减至 2
```

### 核心调控策略清单：
1. **基于排队时延的硬阈值熔断**：
   当调度器就绪队列（Running Queue）中的请求数超过警戒水位线（如 $BS > 32$）时，自动触发退火策略，将草稿步长 $K$ 线性缩减（$K=5 \to 3 \to 1 \to 0$）；当 $K=0$ 时完全退化为原生自回归解码。
2. **基于接受率（Acceptance Rate）的动态反馈环**：
   维护每个请求的滑动窗口接受率 $\bar{\alpha}$：
   - 对于结构化输出（JSON / 代码生成），接受率通常高达 $80\% \sim 90\%$，保持高 $K$ 值投机。
   - 对于高发散性创意写作（Temperature $\ge 0.9$），接受率往往跌破 $30\%$，立即对该会话关闭投机，避免白白浪费前向算力。
3. **KV Cache 显存容量自适应感知**：
   当 PagedAttention 剩余可用物理块比例低于 $20\%$ 时，全面下线树状投机（Tree Attention），仅保留最轻量的单链投机，严防显存 OOM 触发请求重算。

---

## 8. 生产落地检查清单（Production Readiness Checklist）

| 维度 | 检查项 | 生产合格标准 | 常见反模式 |
| :--- | :--- | :--- | :--- |
| **数学精度** | 采样分布一致性检验 | 修正拒绝采样逻辑覆盖，无概率截断失真 | 直接对小模型 Logits 取 Argmax 作为硬输入，污染大模型输出风格 |
| **词表对齐** | Draft 与 Target 词表映射 | 确保两模型 Tokenizer 完全同源，或建立微秒级双向映射表 | 未处理 Special Tokens 映射导致小模型输出未知 ID 触发崩溃 |
| **流控策略** | 吞吐倒挂保护熔断器 | 监控 GPU SM 占用率，高负载（$BS \ge 48$）自动平滑退火 | 无脑全量开启投机，导致线上峰值 QPS 吞吐崩塌 40% |
| **显存治理** | PagedAttention 块生命周期 | 拒绝发生时，未被采纳分支的 KV Cache 块能在微秒级立即释放 | 分支回滚漏回收显存块，造成显存碎片与内存泄漏 |
| **观测指标** | 专属追踪打点（Metrics） | 暴露 `spec_tokens_accepted_ratio`、`spec_effective_speedup` | 仅看端到端延时，忽视单 Token 平均 FLOPs 消耗的剧增 |

---

## 参考资料与规范出处

1. **Leviathan, Y., Kalman, M., & Matias, Y. (2023).** *Fast Inference from Transformers via Speculative Decoding.* International Conference on Machine Learning (ICML 2023). [arXiv:2211.17192](https://arxiv.org/abs/2211.17192)
2. **Chen, C., Borgeaud, S., et al. (2023).** *Accelerating Large Language Model Decoding with Speculative Sampling.* [arXiv:2302.01318](https://arxiv.org/abs/2302.01318)
3. **Cai, T., Li, Y., et al. (2024).** *Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads.* [arXiv:2401.10774](https://arxiv.org/abs/2401.10774)
4. **Li, Y., Wei, F., et al. (2024).** *EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty.* International Conference on Machine Learning (ICML 2024). [arXiv:2401.15077](https://arxiv.org/abs/2401.15077)
5. **vLLM Team (2024).** *Speculative Decoding Architecture & Performance Tuning.* [vLLM Official Documentation](https://docs.vllm.ai/en/latest/models/spec_decode.html)
6. **SGLang Team (2024).** *RadixAttention and Multi-head Speculative Decoding Guide.* [SGLang GitHub Repository](https://github.com/sgl-project/sglang)
