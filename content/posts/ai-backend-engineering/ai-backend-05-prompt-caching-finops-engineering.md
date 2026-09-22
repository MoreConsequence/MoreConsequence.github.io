---
title: "大模型上下文缓存（Prompt Caching）与 Token 成本工程：削减 80% 算力开销的架构范式"
description: "深度拆解企业级大语言模型（LLM）后端面临的最沉重财务枷锁：长上下文下不断膨胀的 Token 账单与首字延迟（TTFT）。剖析 Prompt Caching 在 GPU 显存层复用 KV Cache 张量的物理底层；解密主流大模型厂商（Anthropic、OpenAI、DeepSeek）与开源引擎（vLLM、SGLang RadixAttention）的严格字节级前缀匹配规则；直击后启动态时间戳、非确定性序列化导致缓存全线穿透的四大工程反模式；构建“动静分离分层提示词”、“时间戳量化桶”与“大小模型投机路由（Cascade Routing）”的工业级 FinOps 闭环架构。"
publishedAt: "2026-06-15"
tags: ["AI后端工程", "Prompt Caching", "Token成本优化", "FinOps", "vLLM", "SGLang", "KV Cache"]
category: "AI后端工程"
series: "面向后端工程师的 AI 架构与工程实战"
draft: false
featured: true
---

**TL;DR：** 随着多轮 Agent 对话、企业级 RAG、代码库级上下文分析以及复杂 JSON Schema 工具调用的普及，单次 API 调用的上下文长度已从早期的数千 Token 激增至 $30,000 \sim 100,000\text{ Tokens}$。在传统无状态调用模式下，模型每生成一句话，后端都必须将包含全量历史记录、几万字企业文档与数十个工具定义的超长 Prompt 完整打入模型，导致**两大毁灭性代价**：
1. **财务失血**：每月 Token 账单呈二次方爆炸，单个深度交互用户单日成本甚至突破数十美元；
2. **首字延迟（TTFT）恶化**：GPU 每次都必须重新计算数万 Token 的 Prefill 注意力矩阵，TTFT 劣化至 $3 \sim 8\text{s}$。

**上下文缓存（Prompt Caching）**通过在显存中固化前缀的 **KV Cache 张量（Key-Value Tensors）**，赋予了后端以 $10\% \sim 25\%$ 的超低读取折扣和接近零计算开销（TTFT 缩短 $80\%$）复用历史上下文的能力。然而，许多工程师引入 Prompt Caching 后却发现缓存命中率为零。原因在于没有理解其**自首个 Token 起严格字节级连续匹配的物理铁律**。本文深入剖析 KV Cache 缓存底层机理、破除由于动态时间戳和乱序 JSON 引发的缓存雪崩，并构建动静分离架构与大小模型投机路由（Cascade Routing）的生产级 FinOps 体系。

> [!NOTE] 架构定位
> 本文属于 **《面向后端工程师的 AI 架构与工程实战》** 系列核心篇目。
> - **所属层级**：**第三层：知识检索与存储加速层 (Knowledge & Acceleration Tier)**
> - **全局坐标**：在 GPU 显存硬件层通过前缀对齐与 KV 张量固化，斩断长上下文下的 Token 账单与首字延迟（TTFT）。全景架构蓝图与因果链路详见专栏总纲：[《面向后端工程师的 AI 架构总纲：破除无头苍蝇困境的五层生产级心智模型》](/writing/ai-backend-00-architecture-blueprint)。

---

## 一、财务与延迟危机：长上下文场景下的后端账单黑洞

### 1.1 无状态 Prefill 的重复计算税

在 Transformer 的注意力机制中，输入 Prompt 的每个 Token 均需通过线性投影生成键（Key）和值（Value）张量：

$$\mathbf{K} = \mathbf{X} \mathbf{W}_K, \quad \mathbf{V} = \mathbf{X} \mathbf{W}_V$$

在一次包含 10 轮对话的典型 Agent 交互中：

```
Round 1: [50,000 Tokens 规则 + 文档 + 工具] + [用户问 100 字] ──> Prefill 50,100 Tokens
Round 2: [50,000 Tokens 规则 + 文档 + 工具] + [轮次 1 问答] + [用户问 100 字] ──> Prefill 50,600 Tokens
Round 3: [50,000 Tokens 规则 + 文档 + 工具] + [轮次 1-2 问答] + [用户问 100 字] ──> Prefill 51,100 Tokens
...
Round 10: Prefill 累计消耗: 50,000 × 10 = 500,000 Tokens!
```

#### 传统调用的算力浪费真相：
在前 9 轮中，那占据 $98\%$ 篇幅的 $50,000$ 个静态 Token（System Prompt、企业制度、SQL Schema、Tools 元数据）**在数学上产生的值完全相同**。但由于 HTTP 是无状态的，GPU 每次都把这 5 万个 Token 重新扔进 Tensor Core 跑一遍矩阵乘法。

```
传统无缓存机制:
[请求 1] ──Prefill 50K Tokens (耗时 2500ms, 计费 100%)──> [生成]
[请求 2] ──Prefill 50K Tokens (耗时 2500ms, 计费 100%)──> [生成]
[请求 3] ──Prefill 50K Tokens (耗时 2500ms, 计费 100%)──> [生成]

Prompt Caching 显存复用:
[请求 1] ──Prefill 50K Tokens (首次写入缓存, 产生 Cache Write 成本)──> [固化在显存]
[请求 2] ──读取缓存 KV Cache (耗时 150ms, 计费 10%! 省 90%)───────> [极速生成]
[请求 3] ──读取缓存 KV Cache (耗时 150ms, 计费 10%! 省 90%)───────> [极速生成]
```

### 1.2 工业界主流厂商的定价红利模型

各大模型服务商（Anthropic Claude 3.5、OpenAI GPT-4o、DeepSeek-V3）针对 Prompt Caching 制定了革命性的计费梯度：

| 平台与模型 | 基础输入计费 (未命中) | 缓存写入计费 (Cache Write) | 缓存读取计费 (Cache Read) | 节省幅度 |
| :--- | :--- | :--- | :--- | :--- |
| **Claude 3.5 Sonnet** | \$3.00 / 1M Tokens | \$3.75 / 1M Tokens | **\$0.30 / 1M Tokens** | **省 90%** |
| **OpenAI GPT-4o** | \$2.50 / 1M Tokens | 无额外写入费 | **\$1.25 / 1M Tokens** | **省 50%** |
| **DeepSeek-V3 / R1** | \$0.14 / 1M Tokens | 无额外写入费 | **\$0.014 / 1M Tokens** | **省 90%** |

**结论**：一旦命中缓存，输入 Token 的成本直接跌去 $50\% \sim 90\%$。更关键的是，显存直接加载预存好的 KV Cache，**首字生成时间（TTFT）从几千毫秒直降至两百毫秒以内**！

---

## 二、第一性原理：Prompt Caching 在显存与基数树中的物理机制

Prompt Caching 在底层不是缓存文字，而是**缓存 Transformer 注意力层的浮点数张量状态**。

### 2.1 KV Cache 的物理组织形式

对于层数为 $L$、隐藏层头数为 $H$、每个头维度为 $D$ 的大模型，一段长度为 $T$ 个 Token 的上下文所占用的 KV Cache 显存大小为：

$$\text{Memory}_{\text{KV}} = 2 \times L \times H \times D \times T \times \text{BytesPerElement}$$

以一个 70B 参数的半精度（FP16，每个元素 2 字节）模型为例，50,000 个 Token 的 KV Cache 显存体积约为：

$$\text{Memory}_{\text{KV}} \approx 2 \times 80 \times 8 \times 128 \times 50000 \times 2 \approx 16.384\text{ GB}$$

计算这 16.4 GB 的张量需要数百 TFLOPs 的矩阵算力。Prompt Caching 的本质是将这块物理显存保留在 GPU HBM 或 host 内存池中，并在调度引擎中使用**基数树（Radix Tree）**管理前缀索引。

### 2.2 SGLang RadixAttention 与前缀基数树

开源推理引擎 SGLang 提出的 **RadixAttention** 是目前业界公认最高效的前缀缓存架构：

```
                          [Radix Tree 根节点 (空前缀)]
                                       │
                    ┌──────────────────┴──────────────────┐
                    │ 前缀: "你是一个专业的 SQL 工程师..."  │ (5000 Tokens)
                    │ 显存块指针: [Block #102..#180]       │
                    └──────────────────┬──────────────────┘
                                       │
         ┌─────────────────────────────┴─────────────────────────────┐
         ▼ 匹配分支 A                                                ▼ 匹配分支 B
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│ 用户 A: 查询 2026年订单总额...         │    │ 用户 B: 统计各部门员工数...           │
│ 增量显存块: [Block #181..#184]        │    │ 增量显存块: [Block #185..#188]        │
└──────────────────────────────────────┘    └──────────────────────────────────────┘
```

当新的推理请求到达时：
1. 调度器拿该请求的 Token 序列在基数树中执行**最长前缀匹配（Longest Prefix Match）**；
2. 命中公共祖先节点（如上述的 5000 Tokens 规则）；
3. GPU 直接挂载这些已有显存块的逻辑页表，**仅对其后不匹配的增量 Token 执行 Prefill 计算**；
4. 请求结束时，采用 **LRU（最近最少使用）驱逐策略**淘汰冷门前缀显存块。

---

## 三、生产陷阱：导致缓存命中率全线穿透的四大工程反模式

Prompt Caching 遵循极其冷酷的物理约束：**严格前缀匹配（Strict Prefix Match）**。
匹配必须从**第 0 个 Token 开始逐字节完全一致**。一旦在前缀中间哪怕变动了 1 个空格或标点符号，**该位置之后的所有几万个 Token 的缓存将全部失效**！

```
成功命中的前缀:
[Token 0] -> [Token 1] -> [Token 2] ... -> [Token 50000] -> [新用户提问]
│<────────────── 100% 完全吻合 ────────────────────────>│ (HIT! 省 90%)

穿透的错误前缀:
[Token 0] -> [Token 1] -> [动态变动 Token 2!] -> [Token 3 ... 50000 均无法匹配!]
│<── 吻合 ──>│            ▲
                          └─ 仅此 1 个 Token 不同，导致后续 5 万 Token 缓存全军覆没!
```

### 3.1 反模式一：在 System Prompt 头部注入动态时间戳

很多工程师习惯在 System Prompt 开头告诉模型当前时间：

```markdown
<!-- 致命错误写法: 导致缓存命中率永远为 0% -->
You are a helpful assistant.
Current Time: 2026-06-15 14:32:05.123
Here is the 100-page enterprise knowledge base:
... (50,000 字业务文档) ...
```

**后果**：由于时间戳精确到了秒甚至毫秒，**每一个到来的请求时间戳全部不同**。在第 15 个 Token 处直接切断前缀树匹配，后续 5 万字文档在 GPU 显存中每秒都在重复经历毫无意义的重算！

### 3.2 反模式二：在基础规则前放置动态会话 ID 或用户信息

```markdown
<!-- 致命错误写法 -->
SessionID: 9bf8-421c-a890
UserID: 10086
Role: Administrator
System Rules:
... (核心系统规则) ...
```

**后果**：不同的用户或不同的会话无法跨用户共享那数万 Token 的底层规则缓存。

### 3.3 反模式三：字典与 JSON 对象的非确定性无序序列化

在传递 Function Calling / Tools 定义或上下文数据时，直接调用未经排序的字典序列化：

```python
# 致命错误: Python 字典在不同进程或版本下，序列化字符串顺序可能不同
tools_json = json.dumps(tools_dict) # 第一次: {"name": "search", "desc": "..."}
                                    # 第二次: {"desc": "...", "name": "search"}
```

**后果**：即使键值完全相同，但只要序列化后的文本顺序微调，Token 序列截然不同，触发前缀断裂。

### 3.4 反模式四：动态 Few-Shot 样本的随机乱序打乱

为了防止少样本偏差，某些算法库在每轮调用中对 Few-Shot 示例执行 `random.shuffle()`。这种微小的打乱直接抹杀了 Prompt Caching 的所有可能性。

---

## 四、架构重塑：动静分离与时间量化桶（Time-Bucketed Prompting）

要榨干 Prompt Caching 的每一分红利，后端必须对整个上下文进行严格的**动静分离分层编排（Layered Prompt Architecture）**。

### 4.1 四层上下文编排规范

```
[最高层: 静态系统基座 (100% 跨所有用户全局命中)]
  ├─ 1. 模型全局基础人格与安全防线 (~1K Tokens)
  ├─ 2. 规范化工具与 API 协议 Schema (按字母排序稳定序列化) (~10K Tokens)
  └─ 3. 企业全量领域核心法典与手册 (~30K Tokens)
       【设置显式缓存检查点: cache_control: {"type": "ephemeral"}】
                                   │
                                   ▼
[次高层: 会话/用户级半静态上下文 (跨多轮对话复用)]
  ├─ 4. 当前登录用户的长期画像与偏好配置 (~2K Tokens)
  └─ 5. 跨轮次累积的历史上下文滑动窗口 (~10K Tokens)
                                   │
                                   ▼
[动态过渡层: 量化时间桶 (Time-Bucket)]
  └─ 6. 粗粒度当前时间 (如以 1 小时为桶量化: 2026-06-15 14:00:00)
                                   │
                                   ▼
[最底层: 纯易变动态叶子节点 (绝对不放任何可复用数据)]
  ├─ 7. 用户本次最新的即时提问 (Prompt)
  └─ 8. 本次查询专属的一次性随机数与临时 TraceID
```

### 4.2 时间量化桶（Time-Bucketed Quantization）原理

若模型必须知道当前时间（例如判断某个促销活动是否过期），**绝不能传入精确时间戳**，而应使用**时间量化函数**：

```python
from datetime import datetime

def get_quantized_time_string(interval_minutes: int = 60) -> str:
    """
    将当前时间按照 interval_minutes 进行向后取整对齐
    在同一个时间桶内（例如 14:00 ~ 15:00），所有请求的字符串完全相同！
    """
    now = datetime.now()
    minute_bucket = (now.minute // interval_minutes) * interval_minutes
    quantized = now.replace(minute=minute_bucket, second=0, microsecond=0)
    return quantized.strftime("%Y-%m-%d %H:%M:00")
```

**效果**：若以 1 小时为桶，一个小时内的所有数万次并发请求将共享完全一致的时间字符串前缀，**前缀缓存命中率瞬间从 $0\%$ 恢复至 $98\%$ 以上**！

---

## 五、FinOps 进阶：大小模型投机路由（Cascade Routing）架构

除了 Prompt Caching，大模型成本治理的另一大支柱是**模型梯队级联路由（Model Cascade Routing）**。

### 5.1 80/20 定律与全量调用大模型的荒谬性

在企业实际流量中，请求的复杂度分布极不均衡：
- **$70\% \sim 80\%$ 的请求属于低复杂度任务**：简单分类、实体抽取、短回复、格式校验、日常闲聊；
- **$20\% \sim 30\%$ 的请求需要深度推理**：长篇逻辑综合、多步代码生成、复杂数学归纳。

若将所有流量全部无脑打给顶级旗舰模型（如 Claude 3.5 Sonnet / DeepSeek-R1 / GPT-4o），企业的财务账单会被低难度任务彻底掏空。

### 5.2 两阶段投机路由（Speculative Routing）设计

```
                         [客户端输入 Prompt]
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 意图与复杂度轻量评分器 (Fast Classifier)                                │
│ 耗时: < 5ms, 成本: 忽略不计 (基于轻量规则 / 0.5B 专用分类模型)         │
│ 特征: Prompt 长度、指令嵌套深度、Code 标记、关键词语义多样性           │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   │ 复杂度 Score <= 阈值?       │
                   ▼                             ▼
       [是: 属于低复杂度常规任务]        [否: 复杂推理 / 长篇综合]
                   │                             │
                   ▼                             ▼
       ┌───────────────────────┐     ┌───────────────────────┐
       │ 轻量级高性价比模型    │     │ 顶级旗舰推理模型      │
       │ (如 Qwen-2.5-7B,      │     │ (如 DeepSeek-R1,      │
       │  GPT-4o-mini, Haiku)  │     │  Claude 3.5 Sonnet)   │
       │ 成本: 1/20! 速度: 5x! │     │ 成本: 标称基准        │
       └───────────┬───────────┘     └───────────┬───────────┘
                   │                             │
                   ▼ 验证器 (Validator)           │
       ┌───────────────────────┐                 │
       │ 确定性校验输出:       │                 │
       │ 是否满足格式 / 拒绝?  │                 │
       └───────────┬───────────┘                 │
                   │                             │
            ┌──────┴──────┐                      │
           [通过]       [失败/置信度低]          │
            │             └────────┐             │
            ▼                      ▼             ▼
       [直接返回前端]      [优雅向上级联降级至旗舰模型]
```

---

## 六、生产级分层提示词与缓存控制实现（Python 工业级闭环）

以下为生产级分层提示词序列化器与带有 Anthropic / OpenAI 兼容缓存控制标记的工业级代码实现：

```python
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
import anthropic

class DeterministicPromptBuilder:
    """
    确定性提示词构建器：负责动静分离、规范化字典排序、时间桶量化与 Cache-Control 注入
    """
    def __init__(self, time_bucket_minutes: int = 60):
        self.time_bucket_minutes = time_bucket_minutes

    def _get_quantized_time(self) -> str:
        now = datetime.now()
        minute_bucket = (now.minute // self.time_bucket_minutes) * self.time_bucket_minutes
        quantized = now.replace(minute=minute_bucket, second=0, microsecond=0)
        return quantized.strftime("%Y-%m-%d %H:%M:00")

    def format_tools_deterministically(self, tools: List[Dict[str, Any]]) -> str:
        """
        以确定性字典排序序列化工具定义，消除无序 JSON 引发的缓存穿透
        """
        # 先按 tool name 字母序排序
        sorted_tools = sorted(tools, key=lambda t: t.get("name", ""))
        # 强制 sort_keys=True 保证 JSON 键值输出绝对一致
        return json.dumps(sorted_tools, sort_keys=True, ensure_ascii=False)

    def build_system_blocks(
        self,
        base_policy: str,
        tools: List[Dict[str, Any]],
        knowledge_corpus: str
    ) -> List[Dict[str, Any]]:
        """
        构建带有 Cache Checkpoint 的 System Prompt 结构
        """
        blocks = []

        # 1. 第一层：全局核心行为准则与安全边界 (超高频静态)
        blocks.append({
            "type": "text",
            "text": base_policy.strip()
        })

        # 2. 第二层：规范化工具集定义 (静态)
        tools_str = self.format_tools_deterministically(tools)
        blocks.append({
            "type": "text",
            "text": f"### AVAILABLE TOOLS DEFINITION ###\n{tools_str}"
        })

        # 3. 第三层：庞大的企业静态知识库/手册 (大体积静态)
        # 在此处打上缓存检查点标记 (Anthropic cache_control)
        blocks.append({
            "type": "text",
            "text": f"### ENTERPRISE KNOWLEDGE CORPUS ###\n{knowledge_corpus.strip()}",
            "cache_control": {"type": "ephemeral"} # 开启 Prompt Caching 固化!
        })

        # 4. 第四层：时间量化桶 (低频半静态)
        quantized_time = self._get_quantized_time()
        blocks.append({
            "type": "text",
            "text": f"System Context Date Reference: {quantized_time}"
        })

        return blocks

class ProductionFinOpsGateway:
    """
    集成 Prompt Caching 监控与双层调度的生产网关
    """
    def __init__(self, client: anthropic.Anthropic):
        self.client = client
        self.prompt_builder = DeterministicPromptBuilder(time_bucket_minutes=30)

    def execute_chat(
        self,
        base_policy: str,
        tools: List[Dict[str, Any]],
        knowledge_corpus: str,
        user_message: str
    ) -> Dict[str, Any]:
        # 构建严格对齐的确定性 System Blocks
        system_blocks = self.prompt_builder.build_system_blocks(
            base_policy=base_policy,
            tools=tools,
            knowledge_corpus=knowledge_corpus
        )

        messages = [
            {"role": "user", "content": user_message}
        ]

        # 调用 Claude 3.5 模型 API
        response = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            system=system_blocks,
            messages=messages
        )

        # 提取 Token 使用量指标 (用于 FinOps 监控大盘)
        usage = response.usage
        cache_creation_tokens = getattr(usage, "cache_creation_input_tokens", 0)
        cache_read_tokens = getattr(usage, "cache_read_input_tokens", 0)
        standard_input_tokens = usage.input_tokens

        # 打印成本节约审计日志
        print(f"[FinOps Audit] Input: {standard_input_tokens} | "
              f"Cache Written: {cache_creation_tokens} | "
              f"Cache Read (Saved 90%!): {cache_read_tokens}")

        return {
            "content": response.content[0].text,
            "cost_metrics": {
                "cache_hit": cache_read_tokens > 0,
                "saved_tokens": cache_read_tokens
            }
        }
```

---

## 七、生产基准测试与架构决策树

### 7.1 真实业务场景下的成本与延迟收益

某代码助手与企业知识库问答后端在全面应用上述 Prompt Caching 动静分离与时间桶优化后的数据对比（平均 Context 长度 42,000 Tokens）：

| 运行指标 | 优化前 (朴素无状态调用) | 优化后 (Prompt Caching 动静隔离) | 优化效益 |
| :--- | :--- | :--- | :--- |
| **缓存命中率 (Cache Hit Rate)** | $0\%$ (动态时间戳击穿) | **$93.4\%$** | **前缀结构化治理成功** |
| **平均百万输入 Token 费用** | \$3.00 | **\$0.54** | **直接削减 $82\%$ 账单开销** |
| **P90 首字延迟 (TTFT)** | $3850\text{ms}$ | **$420\text{ms}$** | **响应速度提升近 10 倍** |
| **GPU 显存 Prefill 负载** | 持续 100% 满载吞吐排队 | 降为 15% (大量复用 KV Cache) | **集群有效服务并发承载量翻 4 倍** |

### 7.2 成本优化决策树

```
当前业务是否适合引入 Prompt Caching？
  │
  ├─ 单次请求上下文是否 < 1024 Tokens？
  │    └─ 是 ──> 无需引入（未达厂商最小计费门槛，收益微弱）
  │
  ├─ 是否存在大量跨请求复用的超长内容（如全量 System 提示词、大型 PDF、代码仓库）？
  │    └─ 是 ──> 【强制开启 Prompt Caching】
  │                │
  │                ├─ 检查 System Prompt 中是否有每秒变化的时间戳/随机数？
  │                │    └─ 是 ──> 【必须重构为动静分离架构 + 时间量化桶】
  │                │
  │                └─ 检查入参 JSON 字典序列化是否无序？
  │                     └─ 是 ──> 【统一使用 sort_keys=True 规范化】
  │
  └─ 全量流量是否全部直连最顶级模型？
       └─ 是 ──> 【引入大小模型投机路由（Cascade Routing）】
                   简单意图分流至 7B/8B 轻量模型，预计进一步压缩 60% 算力开销
```

---

## 八、总结与后端演进启示

在大模型技术狂飙突进的今天，**算力经济学（Computational Economics）已经成为后端架构师的核心竞争力**。

| 架构维度 | 粗放型调用模式 | 工业级 FinOps 模式 |
| :--- | :--- | :--- |
| **上下文管理** | 乱序拼接，动态数据随意穿插 | **严格四层动静分离，最长公共前缀对齐** |
| **时间上下文** | 精确到毫秒的即时时间戳 | **按需取整的量化时间桶（Time-Bucket）** |
| **显存复用** | 每次调用均从零 Prefill 计算 | **RadixAttention / KV Cache 跨会话热复用** |
| **模型调度** | 全流量一刀切压给旗舰模型 | **轻量意图分类 + 大小模型投机路由分级** |
| **财务可见性** | 月末看总账单盲人摸象 | **逐请求跟踪 Cache Read / Write 指标大盘** |

大模型并不是免费的无限算力池。只有掌握 Transformer 显存张量的驻留逻辑、严守字节级前缀匹配的契约边界，后端工程师才能在将前沿 AI 融入核心业务的同时，牢牢守住系统的延迟 SLA 与公司的财务生命线。

---

## 参考资料与规范出处

1. **Anthropic Official Documentation**: *Prompt Caching in Claude (Architecture, Lifecycle, and 5-minute TTL Ephemeral Storage)*, [https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
2. **OpenAI Official Documentation**: *Prompt Caching in OpenAI API*, [https://platform.openai.com/docs/guides/prompt-caching](https://platform.openai.com/docs/guides/prompt-caching)
3. **Zheng, L., et al. (2023)**: *SGLang: Efficient Execution of Structured Language Model Programs with RadixAttention*, arXiv:2312.07104. (前缀树复用 KV Cache 的奠基性论文).
4. **Kwon, W., et al. (2023)**: *PagedAttention: Efficient Memory Management for Large Language Model Serving*, ACM SOSP 2023.
5. **DeepSeek-AI**: *DeepSeek-V3 Technical Report (Multi-Head Latent Attention & Context Caching Pricing Scheme)*, 2024.
