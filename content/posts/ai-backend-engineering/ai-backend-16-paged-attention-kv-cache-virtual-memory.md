---
title: "面向后端工程师的 AI 架构与工程实战（十六）：PagedAttention 与显存虚拟化深度解密"
description: "由浅入深解析大模型推理引擎（vLLM）的灵魂支柱 PagedAttention：从 Linux 虚拟内存分页演进心智对照、连续显存预分配 80% 浪费之谜、物理块与逻辑块映射页表、写时复制（CoW）零拷贝共享、到 Multi-Head/GQA/MLA 显存精算与换入换出（Swap）生产落地。"
publishedAt: "2026-06-26"
draft: false
featured: false
series: "面向后端工程师的 AI 架构与工程实战"
tags:
  - "AI Engineering"
  - "PagedAttention"
  - "KV Cache"
  - "vLLM"
  - "Virtual Memory"
  - "Systems"
---

> **TL;DR：**
> 很多后端工程师在刚接触大模型系统时，会以为“模型权重占用显存，跑起来显存就不会变了”。然而在生产推理服务中，**真正把昂贵的 H100 显存吞噬殆尽并导致系统 OOM 崩溃的元凶，是随着对话 Token 逐字吐出而动态膨胀的键值缓存（KV Cache）**。
>
> 在 vLLM 诞生前，传统推理框架（如早期 HuggingFace Transformers）由于必须在 GPU 显存中分配连续物理内存，只能按“最大生成长度（如 2048 或 4096）”为每个请求预先静态分配一块巨大的连续显存。这导致了惊人的 **60%~80% 显存浪费**（内部碎片、外部碎片、以及为超长文本预留但实际未用到的虚拟空间）。
>
> 2023 年加州大学伯克利分校 Kwon 等人提出的 **PagedAttention**（SOSP 2023 最佳论文之一），其核心思想并非神秘的高阶 AI 算法，而是每一个后端工程师从大学操作系统课就极为熟悉的经典智慧：**模仿现代操作系统的虚拟内存分页机制（Paging & Virtual Memory），将物理显存切分成固定大小的 Block（页），通过一张动态页表（Block Table）将不连续的物理块映射到连续的逻辑 Token 序列上**。
>
> 本文将由浅入深，从操作系统的底层哲学出发，拆解 PagedAttention 的完整工业闭环：
> 1. **心智对照**：为什么传统连续显存分配在自回归 Decode 下必然破产？
> 2. **核心机制**：逻辑块（Logical Blocks）、物理块（Physical Blocks）与 Block Table 动态映射。
> 3. **零拷贝黑科技**：写时复制（Copy-on-Write, CoW）如何在 Beam Search 与并行采样中实现显存共享。
> 4. **显存精算数学模型**：从 MHA（多头注意力）到 GQA（分组查询）与 DeepSeek MLA（多头潜变量注意力）的演进方程。
> 5. **生产级 Python 模拟器**：零依赖手写一个具备 Block 分配、映射与换入换出（Swap）的内存管理器。

> **系列架构体系导航**：
> 本文属于《面向后端工程师的 AI 架构与工程实战》系列第十六篇。
> - 全局架构蓝图与体系定位：参见 [《第 00 篇：构建确定性企业级 AI 系统的全局工程蓝图》](/writing/ai-backend-00-architecture-blueprint)
> - 所属分层定位：**第 1 层：协议转换与流式接入层（Protocol & Streaming Ingress）及底层推理引擎优化**
> - 上游协同：配合 [《第 02 篇：流式网关与 SSE 背压》](/writing/ai-backend-02-streaming-gateway-sse-backpressure) 与 [《第 13 篇：投机采样与推测解码》](/writing/ai-backend-13-speculative-decoding-production-serving)
> - 核心工程使命：彻底消除 GPU 显存碎片，将推理服务的并发承载容量（Batch Size）提升 2x~4x，奠定现代大模型高并发服务的物理底盘。

---

## 1. 由浅入深：从 Linux 虚拟内存到 GPU 显存危机

### 1.1 操作系统课上的经典故事：为什么需要分页？

在 20 世纪 60 年代早期的计算机系统中，程序运行要求在物理内存中必须分配一块**连续的地址空间**。
这导致了两个致命的顽疾：
1. **外部碎片（External Fragmentation）**：内存被反复分配与释放后，空闲内存被切割成无数个散落的、很小的碎片。即使全系统剩余总内存有 4GB，但如果找不到一段连续的 1GB 空间，一个新的大程序就根本无法启动！
2. **提前预留与过度承诺（Over-allocation）**：程序声明它最多可能需要 2GB 内存，操作系统就必须老老实实提前切出连续的 2GB 锁死给它。哪怕程序实际只用了 50MB，剩下的 1.95GB 也只能白白闲置，无法供其他进程使用。

计算机科学家如何解决这个问题的？**分页系统（Paging）与虚拟内存（Virtual Memory）**横空出世：
- 物理内存被切成固定大小的“物理页框”（Page Frame，通常是 4KB）；
- 应用程序看到的连续地址只是“虚拟地址”（Virtual Address）；
- 中间通过一张**页表（Page Table）**，将分散在物理内存各处的 4KB 页框拼接成逻辑上的连续视图；
- 当物理内存不够时，还可以通过 **Swap 机制** 把暂时不用的页置换到磁盘上。

```
+-------------------------------------------------------------------------------+
|                       操作系统的历史智慧：虚拟内存映射                        |
+-------------------------------------------------------------------------------+
  应用程序的视角: 连续虚拟内存 (Virtual Pages)
  [ Page 0 ] [ Page 1 ] [ Page 2 ] [ Page 3 ]
       |          |          |          |
       v          v          v          v
  +-------------------------------------------+
  |              页表 (Page Table)             |  <-- 动态映射转换
  +-------------------------------------------+
       |          |          |          |
       v          v          v          v
  散落的实际物理内存 (Physical Frames)
  [ Frame 8 ] ... [ Frame 2 ] ... [ Frame 15 ] ... [ Frame 3 ]
  (只要物理上有空余页框，无需连续即可立即运行，彻底消灭外部碎片！)
```

### 1.2 历史重演：大模型推理引擎为何陷入当年的绝境？

在 2023 年之前的早期大模型推理框架中，工程师们在 GPU 显存管理上**几乎完整重演了 60 年前的连续内存悲剧**。

#### 什么是 KV Cache？为什么它非要连续？
在 Transformer 解码过程中，每一个新生成的 Token 必须与前面所有历史 Token 的 Key 向量和 Value 向量进行 Dot-Product 注意力计算。
为了避免每一步都重新对历史 Prompt 进行重复计算，推理框架会将历史 Token 的 Key 和 Value 矩阵保存在显存中，这就是 **KV Cache**。

在标准的 PyTorch 矩阵乘法 Kernel 中，注意力算子（如 `Softmax(Q * K^T) * V`）要求张量在物理显存中是**连续存储的（Contiguous Memory Buffer）**。

#### 连续性要求带来的毁灭性后果：
假设你启动了一个提供聊天问答的 API 服务，模型支持最大上下文为 $4096$ Token。
- 当一个用户发来请求时，系统**根本不知道**这个用户最终会聊多少轮、大模型会回答多少个字（可能大模型只回答了“你好”两个字就结束了，也可能长篇大论回答 3000 字）。
- 但因为 PyTorch 算子要求内存必须连续，且 GPU 显存动态重分配（`cudaMalloc`）耗时高达几毫秒甚至几十毫秒，绝对无法在每吐出一个字时动态扩容。
- 早期框架唯一的选择：**在请求到达的瞬间，就按最大可能长度（Max Length = 4096）为这个请求直接预分配一块巨大的连续显存！**

```
传统连续静态分配下的显存“三大公害”：
+-------------------------------------------------------------------------------+
| 请求 1 的显存空间预分配 (4096 Tokens)                                         |
| [ Prompt (200) ] [ 实际生成 (100) ] [               浪费的预留空间 (3796)           ] |
+-------------------------------------------------------------------------------+
  ^                  ^                 ^
  |                  |                 +-- 1. 预留碎片 (Reservation Waste): 占 70% 显存
  |                  +-- 2. 内部碎片 (Internal Waste): 阶段性分配但尚未填充
  +-- 3. 外部碎片 (External Waste): 多个请求结束释放后，留下大小不一的不可用空隙
```

根据伯克利团队的真实生产测试数据，在传统的系统设计中，**有效存放实际 KV Cache 的显存比例仅占 20.4% ~ 38.2%，超过 60% ~ 80% 的显存被各种碎片无情挥霍！**
这就意味着：原本一张 80GB 的 A100/H100 显卡能够并发服务 30 个用户，结果因为碎片问题，跑到 8 个并发就会报 `CUDA Out of Memory` 崩溃！

---

## 2. PagedAttention 核心架构：把显存当成“磁盘与页框”

加州大学伯克利分校的研究者们给出的解法极其优雅：
> **如果硬件算子要求张量必须连续，那我们就打破这个算子！设计一个新的 GPU 注意力 Kernel，让它能够直接在非连续的离散物理块（Physical Blocks）上并发计算 Attention！**

这就是 **PagedAttention**。

```
                                [ 请求逻辑视角 (Logical Sequence) ]
                                 Token 0, 1, 2, ... , 15 (逻辑上绝对连续)
                                              |
                                              v
                              +-------------------------------+
                              |    块表 / 页表 (Block Table)   |
                              | 逻辑块 0  -> 物理块 7         |
                              | 逻辑块 1  -> 物理块 2         |
                              | 逻辑块 2  -> 物理块 19        |
                              +-------------------------------+
                                              |
                     +------------------------+------------------------+
                     |                        |                        |
                     v                        v                        v
             [ GPU 物理块 7 ]          [ GPU 物理块 2 ]         [ GPU 物理块 19 ]
             (显存地址 0x1A00)         (显存地址 0x8F00)         (显存地址 0x3C00)
             存放 Token 0~3            存放 Token 4~7            存放 Token 8~11
```

### 2.1 物理块与逻辑块（Block & Block Size）
- **物理块（Physical Block）**：GPU 显存被预先切分成固定容量的物理容器。每个 Block 可以容纳固定数量的 Token（称为 `block_size`，工程实践中通常设置为 $16$ 或 $32$）。
- **逻辑块（Logical Block）**：在某个请求的上下文内部，从第 0 个 Token 开始按 `block_size` 连续切片。
- **Block Table（块表）**：由推理引擎在 CPU 宿主机维护的轻量数据结构，记录每个请求的“逻辑块号 $\to$ 物理块号”映射关系。

### 2.2 动态按需分配机制（On-Demand Allocation）
当一个新的请求到达时：
1. 系统只根据 Prompt 实际长度分配必需的物理块（例如 Prompt 有 35 个 Token，`block_size=16`，则只需分配 $\lceil 35 / 16 \rceil = 3$ 个物理块）；
2. 随着 Decode 过程逐字生成，新 Token 顺序写入当前最后一个物理块；
3. **当且仅当当前物理块写满 16 个 Token 时，才向全局显存池申请第 4 个物理块**，并在 Block Table 中追加一条映射记录；
4. 最后一个物理块未填满的部分（最多只有 15 个 Token 的空间），是全系统**唯一的内部碎片**。在 `block_size=16` 时，显存浪费率直接降至 **小于 3%**！

---

## 3. 杀手级特性：写时复制（Copy-on-Write）与零拷贝共享

在高级 AI 应用中，经常需要同一段 Prompt 派生出多个不同的输出分支，典型场景包括：
- **Beam Search（束搜索）**：每一步保留 Top-K 个最可能的候选分支；
- **Parallel Sampling（并行采样）**：让大模型对同一个问题生成 3 个不同版本的答案供用户挑选（如写作助手）；
- **LLM-as-a-Judge 多评测**：多路评委同时分析同一篇输入文章。

在传统框架中，如果对同一个 Prompt 复制 4 个分支，必须将这段 Prompt 对应的 KV Cache **在显存中物理复制 4 份**！若 Prompt 有 8000 Token，4 份复制直接吞掉数十 GB 显存。

### 3.1 PagedAttention 的 CoW 机制

借助 Block Table 虚拟化，不同请求的逻辑块可以直接**指向同一个物理块**，并维护一个引用计数（Reference Count）：

```
[ 原始 Prompt: "请为一家新能源公司起 3 个响亮的名字..." (逻辑块 0, 1) ]
                                   |
         +-------------------------+-------------------------+
         |                                                   |
         v                                                   v
[ 候选分支 A 的 Block Table ]                        [ 候选分支 B 的 Block Table ]
逻辑块 0 -> 物理块 100 (Ref=2)                      逻辑块 0 -> 物理块 100 (Ref=2)
逻辑块 1 -> 物理块 101 (Ref=2)                      逻辑块 1 -> 物理块 101 (Ref=2)
         |                                                   |
         | (分支 A 开始生成自己的字: "光驰")                    | (分支 B 开始生成自己的字: "绿脉")
         v                                                   v
逻辑块 2 -> 物理块 201 (全新独占分配!)                逻辑块 2 -> 物理块 305 (全新独占分配!)
```

当分支 A 要在物理块中写入属于它自己的独占 Token 时：
1. 检查目标物理块的引用计数。
2. 若 `ref_count == 1`：说明无其他请求共享，直接原位就地写入。
3. 若 `ref_count > 1`：**触发写时复制（Copy-on-Write）**！分配一个新物理块，把被共享块的内容复制一份给它，并将旧块引用计数减 1，然后在这个独立新块上完成写入。

这一机制使得多候选分支生成的显存开销**降低了 55% 以上**，几乎完全消除了共享前缀的数据冗余。

---

## 4. 显存精算数学模型：MHA vs GQA vs MLA

作为资深后端工程师，你必须能够用数学公式精确估算出任何模型在特定并发下的 KV Cache 显存消耗。

### 4.1 通用显存精算方程

设一个 Transformer 模型的超参数如下：
- 模型层数（Layers）：$L$
- 键值头数（KV Heads）：$H_{\text{kv}}$
- 每个注意头的维度（Head Dimension）：$D_{\text{head}}$
- 数值精度（Precision）：通常为 FP16 / BF16（每个数值占用 2 字节）

生成 **1 个 Token**，其在单层 Transformer 中需要存储一个 Key 向量和一个 Value 向量：
$$\text{Memory per Token per Layer} = 2 \times (\text{Key} + \text{Value}) = 2 \times (H_{\text{kv}} \times D_{\text{head}} \times 2) \text{ 字节} = 4 \times H_{\text{kv}} \times D_{\text{head}} \text{ 字节}$$

将全模型 $L$ 层累加，并换算为整个上下文长度 $S$（Sequence Length）的单会话总显存：
$$\text{KV Cache Size}(S) = 4 \times L \times H_{\text{kv}} \times D_{\text{head}} \times S \text{ 字节}$$

```
+-----------------------------------------------------------------------------------------------+
| 注意力架构演进对显存的剧烈压缩                                                                  |
+---------------------+-------------------+-------------------------------+---------------------+
| 架构类型            | 键值头组织形式    | 显存占用比例 (以 70B 模型为例)  | 典型代表模型        |
+---------------------+-------------------+-------------------------------+---------------------+
| 1. MHA (多头注意力) | H_kv = H_q = 64   | 100% (基准, 极其沉重)         | LLaMA-1, GPT-3      |
+---------------------+-------------------+-------------------------------+---------------------+
| 2. GQA (分组查询)   | H_kv = 8 (共享 Q) | 12.5% (显存直降 87.5%！)      | LLaMA-2/3, Qwen-2.5 |
+---------------------+-------------------+-------------------------------+---------------------+
| 3. MLA (多头潜变量) | 降维低秩隐空间压缩 | 约 1.5%~3% (显存极度压缩)     | DeepSeek-V2 / V3    |
+---------------------+-------------------+-------------------------------+---------------------+
```

#### 实例实算：以 LLaMA-3-70B（GQA）为例
- $L = 80$ 层
- $H_{\text{kv}} = 8$（注意：查询头 $H_q = 64$，但 GQA 使得 KV 头被压缩到了 8）
- $D_{\text{head}} = 128$
- 精度为 FP16（2 字节）

计算单 Token 的全层 KV 显存开销：
$$\text{Bytes per Token} = 4 \times 80 \times 8 \times 128 = 327,680 \text{ 字节} \approx 0.3125 \text{ MB}$$

如果一个请求的上下文达到 $S = 8192$（8K 上下文）：
$$\text{Single Request KV Cache} = 8192 \times 0.3125\text{ MB} = 2560\text{ MB} = 2.5\text{ GB}$$
在并发 Batch Size 为 32 时，仅仅存放 KV Cache 就需要：
$$32 \times 2.5\text{ GB} = 80\text{ GB}$$
**整整吞掉一张完整的 NVIDIA A100/H100 80GB 显卡！**
这就是为什么在模型权重占用（如 4-bit 压缩后约 35GB）之外，显存虚拟化与紧凑管理直接决定了服务的生与死。

---

## 5. 生产级 Python 模拟器：手写 BlockManager 与分页映射

为了让后端工程师穿透黑盒，彻底理解 vLLM 底层的显存调度逻辑，以下我们用纯 Python 构建一个最小可运行、具备**逻辑块映射、按需分配、CoW 引用计数、以及 Swap 换出**的显存管理器：

```python
import math
from typing import Dict, List, Optional, Set

class PhysicalBlock:
    """代表 GPU 或 CPU 显存/内存中的一个固定物理块"""
    def __init__(self, block_id: int, block_size: int, is_gpu: bool = True):
        self.block_id = block_id
        self.block_size = block_size
        self.is_gpu = is_gpu
        self.ref_count = 0                     # 共享引用计数 (用于 CoW)
        self.data: List[str] = []              # 存放 Token 的插槽 (最多 block_size 个)

    def is_full(self) -> bool:
        return len(self.data) >= self.block_size

    def append_token(self, token: str):
        if self.is_full():
            raise OverflowError("Block is already full!")
        self.data.append(token)

class BlockManager:
    """
    PagedAttention 核心显存块管理器
    负责: 空闲块池管理、逻辑块到物理块路由映射、写时复制 (CoW)
    """
    def __init__(self, num_gpu_blocks: int, num_cpu_blocks: int, block_size: int = 16):
        self.block_size = block_size
        # 初始化物理块资源池
        self.gpu_blocks = [PhysicalBlock(i, block_size, is_gpu=True) for i in range(num_gpu_blocks)]
        self.cpu_blocks = [PhysicalBlock(i, block_size, is_gpu=False) for i in range(num_cpu_blocks)]
        
        self.free_gpu_blocks: Set[int] = set(range(num_gpu_blocks))
        self.free_cpu_blocks: Set[int] = set(range(num_cpu_blocks))
        
        # 记录每个序列（Sequence）的 Block Table: seq_id -> List[PhysicalBlock]
        self.block_tables: Dict[str, List[PhysicalBlock]] = {}

    def allocate_prompt(self, seq_id: str, prompt_tokens: List[str]):
        """为一个刚入站的请求初始化分配物理块"""
        num_tokens = len(prompt_tokens)
        num_blocks_needed = math.ceil(num_tokens / self.block_size)

        if len(self.free_gpu_blocks) < num_blocks_needed:
            raise MemoryError(f"GPU OOM: 需要 {num_blocks_needed} 个物理块，但仅剩 {len(self.free_gpu_blocks)} 个！")

        allocated_blocks: List[PhysicalBlock] = []
        for i in range(num_blocks_needed):
            block_id = self.free_gpu_blocks.pop()
            block = self.gpu_blocks[block_id]
            block.ref_count = 1
            block.data.clear()

            # 将 Prompt 切片填入物理块
            start_idx = i * self.block_size
            end_idx = min(start_idx + self.block_size, num_tokens)
            block.data = list(prompt_tokens[start_idx:end_idx])
            allocated_blocks.append(block)

        self.block_tables[seq_id] = allocated_blocks

    def append_slot(self, seq_id: str, token: str):
        """Decode 阶段逐字生成时的按需增量分配逻辑"""
        table = self.block_tables[seq_id]
        last_block = table[-1]

        # 检查最后一个块是否由于分支采样被其他请求共享
        if last_block.ref_count > 1:
            # 触发写时复制 (Copy-on-Write)
            if not self.free_gpu_blocks:
                raise MemoryError("GPU OOM on Copy-on-Write!")
            new_block_id = self.free_gpu_blocks.pop()
            new_block = self.gpu_blocks[new_block_id]
            new_block.data = list(last_block.data) # 浅拷贝数据
            new_block.ref_count = 1

            last_block.ref_count -= 1
            table[-1] = new_block                  # 更新当前请求的页表指向
            last_block = new_block

        if not last_block.is_full():
            # 原位追加
            last_block.append_token(token)
        else:
            # 当前块已满，按需申请新的物理块！
            if not self.free_gpu_blocks:
                raise MemoryError("GPU OOM: 显存池耗尽，需要触发 Swap 或请求抢占！")
            new_block_id = self.free_gpu_blocks.pop()
            new_block = self.gpu_blocks[new_block_id]
            new_block.ref_count = 1
            new_block.data.clear()
            new_block.append_token(token)
            table.append(new_block)

    def fork_sequence(self, parent_seq_id: str, child_seq_id: str):
        """派生分支 (如 Beam Search / 并行采样)，实现零拷贝共享"""
        parent_table = self.block_tables[parent_seq_id]
        child_table = []
        for block in parent_table:
            block.ref_count += 1                  # 仅仅增加引用计数，不发生实际物理内存拷贝！
            child_table.append(block)
        self.block_tables[child_seq_id] = child_table

    def free_sequence(self, seq_id: str):
        """释放请求占用的全部物理块"""
        if seq_id not in self.block_tables:
            return
        table = self.block_tables.pop(seq_id)
        for block in table:
            block.ref_count -= 1
            if block.ref_count == 0:
                block.data.clear()
                self.free_gpu_blocks.add(block.block_id)

    def swap_out(self, seq_id: str):
        """显存不足时将冷请求的 Block 换出到 CPU 内存 (Swap-Out)"""
        gpu_table = self.block_tables[seq_id]
        if len(self.free_cpu_blocks) < len(gpu_table):
            raise MemoryError("CPU Swap 内存也已耗尽！")

        cpu_table = []
        for gpu_block in gpu_table:
            cpu_block_id = self.free_cpu_blocks.pop()
            cpu_block = self.cpu_blocks[cpu_block_id]
            cpu_block.data = list(gpu_block.data) # 模拟 PCI-e 传输到 Host 内存
            cpu_block.ref_count = gpu_block.ref_count
            cpu_table.append(cpu_block)

            # 释放 GPU 块
            gpu_block.ref_count = 0
            gpu_block.data.clear()
            self.free_gpu_blocks.add(gpu_block.block_id)

        self.block_tables[seq_id] = cpu_table
```

---

## 6. 生产落地检查清单（Production Readiness Checklist）

| 维度 | 检查项 | 生产合格标准 | 常见反模式 |
| :--- | :--- | :--- | :--- |
| **块大小选型** | `block_size` 参数调优 | 短文本选 16（防内部碎片），长文本与 Prefill 选 32（减小调度开销） | 盲目设为 64 或 128，导致高并发短对话中内部碎片剧增 |
| **抢占策略** | 显存耗尽时应急预案 | 首选 Swap 到 CPU 内存，次选按优先级重计算（Preemption Recompute） | 发生 OOM 时直接抛异常杀死进程，导致同卡所有正常请求一同崩溃 |
| **前缀复用** | 静态前缀与动态对话共享 | 配合 RadixAttention 树状索引，跨请求共享 System Prompt 物理块 | 每次请求重新全量 Prefill 相同的千字系统设定，浪费 80% 算力 |
| **并发容量** | 最大并发 Batch Size 核算 | 按 `(总可用显存 - 权重) / (P90 长度 * 单 Token 开销)` 动态限流 | 凭感觉配置并发，遇到多用户同时发起万字长对话引发集群雪崩 |
| **PCI-e 瓶颈** | Swap 换入换出频率监控 | 维持 Swap 比例低于请求总量的 5%，防止 PCI-e 带宽打满拖垮 GPU | 依赖大量 Swap 硬抗严重超售，导致端到端延迟（ITL）劣化 10 倍 |

---

## 参考资料与规范出处

1. **Kwon, W., Li, Z., et al. (2023).** *Efficient Memory Management for Large Language Model Serving with PagedAttention.* Proceedings of the 29th ACM Symposium on Operating Systems Principles (SOSP 2023). [arXiv:2309.06180](https://arxiv.org/abs/2309.06180)
2. **Ainslie, J., et al. (2023).** *GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints.* [arXiv:2305.13245](https://arxiv.org/abs/2305.13245)
3. **DeepSeek-AI. (2024).** *DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model (Multi-head Latent Attention MLA Architecture).* [arXiv:2405.04434](https://arxiv.org/abs/2405.04434)
4. **Silberschatz, A., Galvin, P. B., & Gagne, G. (2018).** *Operating System Concepts (10th Edition) - Chapter 9: Virtual Memory.* Wiley.
5. **vLLM Team. (2024).** *vLLM Core Architecture and PagedAttention Implementation Deep Dive.* [vLLM Documentation](https://docs.vllm.ai/)
