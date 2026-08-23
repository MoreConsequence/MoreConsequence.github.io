---
title: "少发 Token 才是硬道理：从 Databricks 与 Shopify 实测看 Harness 的经济性"
description: "系列终篇拆解 Agent Harness 的经济学本质：Databricks 百万行基准与 Shopify 生产案例揭示的成本规律、pi-telemetry 如何实现跨供应商中立记账，以及全系列 9 篇从 Loop 到扩展的工程承诺矩阵。"
publishedAt: "2026-08-20"
tags: ["Agent", "Token经济学", "基准评测", "开源"]
draft: false
featured: false
series: "Agent 的方方面面"
---

**TL;DR：** 编码 Agent 的竞争早已不是“谁的模型单价更便宜”，而是“谁的 Harness 更加节约 Token”。Databricks 针对百万行真实企业代码库的基准测试表明：同一模型在不同 Harness 下，单任务成本差可达 2 倍以上；GLM 5.2 搭配 Pi（$1.25/任务）能以接近一半的成本打平 Opus 4.8 跑在 Claude Code 上的通过率（~87.5%），其核心在于 Pi 每轮喂给模型的上下文比全能型竞品少约 3 倍。在 Shopify 工业级工程实践中，极简 Harness 驱动的 Liquid PR #2056 实现了 53% 的提速与 93 次持续提交。本文作为系列终篇，剖析 `pi-telemetry`（935 行）的供应商中立记账机制，并给出贯穿全系列 9 篇的完整工程承诺与架构矩阵。

## 一、Token 单价不是任务成本的预测因子

在评估 Agent 时，常见的误区是直接按模型厂商公开的每百万 Token 价格（$ / M tokens）去估算实际使用成本。然而，Databricks 在 2026 年 7 月 8 日发布的百万行企业级代码基准测试给出了完全不同的结论：**Harness 的上下文装配策略与工具调用开销，对最终任务成本起着决定性作用。**

下表汇总了 Databricks 官方在同等思考档位与真实 PR 任务下的实测数据：

| 模型 + Harness 组合 | 单任务平均成本 | 平均每轮 Context 规模 | 任务通过率 (Pass@1) | 成本/效能比评级 |
| --- | --- | --- | --- | --- |
| **GLM 5.2 + Pi** | **$1.25** | **约 14.2k tokens** | **87.5%** | 极高（低成本平替旗舰） |
| **Opus 4.8 (high) + Claude Code** | $2.00 | 约 45.6k tokens | 87.5% | 中等（基准旗舰对照） |
| **Opus 4.8 (xhigh) + Pi** | $2.10 | **约 15.8k tokens** | **90.0%** | **全场最高通过率** |
| 某全能型开源 Harness + GPT-5 | $3.40 | 约 68.0k tokens | 81.0% | 较差（多工具导致上下文雪崩） |

*数据来源：Databricks Engineering Blog (2026-07-08)。外部实证数据，标注厂商基准。*

为什么 Pi 能做到单轮上下文少约 3 倍？回顾本系列前几篇的核心机制：
1. **03 篇系统提示词克制**：模板主体仅 1288 字符（~322 tokens），工具只保留单行简述；
2. **05 篇四工具极简主义**：没有臃肿的专用检索和状态查询工具，避免模型每轮调用产生大量冗余的 schema 与中间返回值；
3. **03 篇 Compaction 严格闸门**：`16384 reserve / 20000 keep` 确定性压缩，防止无效历史轮次在上下文中无限滚雪球。

## 二、工业级实证：Shopify 生产环境的大规模提效

除了学术和基准测试，Shopify 在 2026 年 4 月 15 日公开的内部工程实践是极简 Harness 跑通工业级大工程的典型例证。在核心模板引擎 Liquid 的重构项目（PR #2056，包含 93 个 commit，核心执行提速 53%）中，Shopify 深度整合了 Pi 架构：

- **300x 单元测试快速反馈**：依托 05 篇中轻量高效的 `bash` 执行树与滚动缓冲，Agent 在修改代码后以毫秒级获得本地测试反馈，而不是陷入漫长的全量 CI 等待；
- **20% React Mount 渲染开销优化**：Agent 配合精确的 `edit` 行级替换（05 篇），避免全文件重写带来的 AST 紊乱与冗余变更；
- **65% 自动化 CI 首次绿灯率**：基于 04 篇树状会话（`/tree`）的探索与回退能力，Agent 在发现逻辑死胡同时可迅速切回上一个干净的分支重新探索。

工业级场景的教训表明：**越是复杂的真实工程，越不需要一个自作聪明、过度包装的“全自动黑盒 Agent”，而需要一个状态透明、命令可控、成本可预测的极简 Harness。**

## 三、pi-telemetry：跨 47 家供应商的中立记账

为了精确掌控每次任务的经济账，Pi 将遥测抽象为独立的跨层包 `pi-telemetry`（935 行 LOC）：

```ts
// packages/telemetry/src/types.ts（结构示意）
export interface UsageRecord {
  turnId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  durationMs: number;
  costUsd: number;
}
```

其工程价值在于：
1. **抹平 47 家供应商的用量口径**：将 OpenAI、Anthropic、Google、本地 llama.cpp 的计费与缓存字段转换为统一的 `UsageRecord`；
2. **延迟与成本精确归因**：在 06 篇统一重试层中，将网络重试等待时间、模型生成时间和工具执行时间分开记账；
3. **会话级预算刹车**：结合 02 篇的 Agent Loop，实时累加会话花费，达到预算上限时触发确定性收敛。

## 四、全系列总结：Harness 的工程承诺矩阵

至此，《Agent 的方方面面》全系列 9 篇已完整覆盖从底层循环、上下文组装、状态持久化到安全容器与成本优化的全部维度。下表总结了本系列的工程承诺与核心落点：

| 篇目 | 核心工程问题 | Pi 的架构解答 | 对应源码 / 规范依据 | 核心收益 |
| --- | --- | --- | --- | --- |
| **01 架构总览** | Harness 与模型的职责分界 | 5 个职责清晰的包 + 6 项刻意不做 | `pi/README.md`，LOC 实测 | 核心包一周可读完 |
| **02 循环控制** | Agent 循环如何确定性收敛 | 外层 Turn + 内层工具，三大终止闸门 | `packages/agent/src/agent-loop.ts` (796行) | 杜绝死循环与静默截断 |
| **03 上下文装配** | 如何把每轮上下文减少 3 倍 | 1288 字符模板 + 确定性压缩闸门 | `packages/coding-agent/src/core/system-prompt.ts` | 极大降低单任务 Token 消耗 |
| **04 会话持久化** | 状态如何跨进程存活与防损 | JSONL 树状结构 + 崩溃原子修复 | `docs/session-format.md`，v1-v4 迁移 | 支持历史分支与故障自愈 |
| **05 工具设计** | 为什么 4 个工具足够写代码 | 万能 `bash` + 50KB 缓冲 + `edit` 替换 | `packages/agent/src/tools/` (1600行) | 降低 Schema 复杂度 |
| **06 供应商层** | 47 家 API 如何抹平差异 | 统一流式 + 可取消的重试定时器 | `packages/ai/src/` (23.5k行) | 解耦模型厂商锁定 |
| **07 扩展与自修改** | 功能不内置如何满足复杂需求 | 5 组生命周期事件 + 34 行权限门禁 | `examples/extensions/` (79个示例) | 核心极简，业务能力可后装 |
| **08 安全与沙箱** | 命令执行如何防注入与防逃逸 | `BashOperations` 接口对接 Gondolin/Docker | `docs/containerization.md`，`project_trust` | 把安全留给物理容器 |
| **09 Token 经济** | 怎么花最少的钱跑出最高成功率 | 上下文纪律 + `pi-telemetry` 中立记账 | Databricks 2026 基准 / Shopify 案例 | 实现 2x+ 成本优势 |

### 给工程师的 Agent 构建法则

1. **不要从写 Prompt 开始，从设计 Loop 和 Stop Condition 开始**；
2. **对进上下文的每一个 Token 保持极度挑剔**，把装配权交给确定性的文件系统与代码规则；
3. **会话使用追加式日志（Append-only Log）与树状拓扑**，给探索提供后悔药；
4. **把功能做成生命周期钩子（Extensions），把安全做成操作系统沙箱（Container）**。

## 参考资料

- Databricks Engineering: *Benchmarking Coding Agents on Million-Line Codebases* (2026-07-08)
- Shopify Engineering Blog: *Accelerating Liquid Engine with Pi Coding Agent* (2026-04-15)
- `packages/telemetry/`：`pi-telemetry` 跨供应商遥测与成本跟踪
- earendil-works/pi @ commit `5cd93f6`（2026-08-20 源码基线）
