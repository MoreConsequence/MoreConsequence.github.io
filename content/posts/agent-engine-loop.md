---
title: "Agent 不会自己停：796 行循环里的三个终止闸门"
description: "读 Pi 的 agent-loop.ts（796 行）回答 Agent 的核心工程问题：循环如何收敛、模型喋喋不休时谁叫停、输出截断和工具失败怎么处理、为什么「全部工具都要求停」才停。"
publishedAt: "2026-08-20"
tags: ["Agent", "架构", "开源"]
draft: false
featured: false
series: "Agent 的方方面面"
---

**TL;DR：** 把 Agent 想成"会思考的对话"会漏掉最关键的工程面：它其实是一个循环，且**这个循环没有天然的终点**——模型每轮都能要求再调用一次工具，谁是闸门？Pi 的答案在 [`packages/agent/src/agent-loop.ts`](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts)（796 行）里：外层 turn 循环 + 内层工具执行循环，三个终止闸门把它收敛——**错误/中止立即终止**、**输出被截断则整批工具调用作废重发**、**只有一批工具结果全部声明 `terminate: true` 才提前停**。本文把三个闸门和一个关键细节（并行工具批如何保持结果顺序）逐行讲透。

## 一、为什么 Agent 的核心是循环，不是对话

Claude Code、Codex、Pi 这类工具的共同结构是一条消息流水线之外套一层循环：用户消息 → 模型回复 → 如果回复里要求调用工具，执行工具、把结果喂回 → 模型再回复 →……直到模型"决定"不再调用工具。

这一层循环就是 harness 与"聊天机器人"的分界线。聊天机器人只有一个 turn；Agent 的 turn 数由模型自己决定，**模型在收尾前没有任何机制保证它一定会停**。所以每个 Agent harness 的第一工程问题不是"提示词怎么写"，而是：**这个循环靠什么条件收敛？**

Pi 把答案收进一个文件：`agent-loop.ts` 共 796 行（commit 5cd93f6 实测），注释第一行就标明了设计定位——"循环内部统一用 AgentMessage，只在 LLM 调用边界转换为 Message"。

## 二、双层循环：外层管 turn，内层管工具

`runLoop`（行 155-275）是唯一的主函数，结构是嵌套的两个 `while`：

```ts
// agent-loop.ts 骨架（节选，行 155-275 的逻辑主干）
while (true) {                                    // 外层：一轮 Agent 运行
  let hasMoreToolCalls = true;
  while (hasMoreToolCalls || pendingMessages.length > 0) {   // 内层：工具收敛
    // 1. 先注入排队消息（steering messages）
    // 2. streamAssistantResponse：把上下文+工具定义交给模型，流式收回复
    // 3. 若回复含 toolCall：
    //    - stopReason === "length" → 整批作废（见第三节）
    //    - 否则 executeToolCalls 并行执行 → 工具结果回填上下文
    //    - hasMoreToolCalls = !executedToolBatch.terminate（见第三节）
    // 4. turn_end 事件；prepareNextTurn 可换模型；shouldStopAfterTurn 可提前停
  }
  // 内层结束：检查 follow-up 消息，没有就 break
}
```

`packages/agent/src/agent-loop.ts:170` 与 `:174` 分别就是这两个 `while`。外层循环基本只做一件事——当内层收敛后，check 有没有排队中的后续消息（用户趁 Agent 干活时追加的指令），有就继续下一轮，没有就 `agent_end`。

这个双层结构本身就是设计声明：**"干活"（工具调用循环）和"换一次话题"（turn）是两个不同的收敛域**。一个 turn 内模型可以连续调用十次工具而不算"间断"；只有工具不再被要求，话题才真正结束。

## 三、三个终止闸门：错误、截断、terminate

内层循环的每一次迭代都由模型回复的 `stopReason` 和工具结果共同决定走向。三个闸门分别对付三种停不下来的方式：

**闸门一：error / aborted——立即终止，不补救。** 行 196-200：只要模型回复的 `stopReason` 是错误或被 AbortSignal 中止，立刻发 `turn_end` + `agent_end` 并 `return`。没有重试、没有降级——循环是"检查点之后可重跑"的设计，状态全部在 context 里，所以失败时优雅退场比重试更省事（这正是本系列 04 篇会话持久化的前提）。

**闸门二：length 截断——整批工具调用作废，重发。** 行 207-214 是最容易被忽略也最值得抄回自己项目的一处：如果 `stopReason === "length"`（输出撞上 token 上限被截断），模型这条消息里的**所有**工具调用不会被执行，而是全部返回一个错误结果："响应撞到输出上限，参数可能不完整，请重新发出完整的工具调用"（`failToolCallsFromTruncatedMessage`，行 381-406）。

为什么这么狠？源码注释（行 374-380）给出了原因：流式工具调用的参数在结束时经过 JSON 修复解析，**截断的消息可能产生"能解析、能通过 schema 校验、但内容静默不全"的参数**。执行这种调用比拒绝它还危险——`edit` 的位置参数截断一半，可能改错文件而不是报错。宁可让模型重来，也不执行可疑参数。这是"fail-safe"优于"fail-fast"的实例：对不完整输入，最快的失败（整批作废）比最准的猜测更安全。

**闸门三：terminate——只有「全部」都要停才停。** 这是收敛规则里反直觉的一条（行 216 + 行 582-584）：

```ts
function shouldTerminateToolBatch(finalizedCalls: FinalizedToolCallOutcome[]): boolean {
  return finalizedCalls.length > 0 && finalizedCalls.every((f) => f.result.terminate === true);
}
```

单个工具可以在结果里声明 `terminate: true`，但它只对"本批全部结果都声明 terminate"才生效。为什么不是"任一工具想停就停"？因为工具并行执行（见第四节），某两个工具成功、第三个工具返回 `terminate`——如果任一即停，前两个的结果就白跑了；而"全部都要停"意味着模型这轮要求的所有事都办完了，停得干净。这条规则也和闸门一形成对照：**错误会立即终止（状态可能没办完），成功则要全体确认才收工。**

再加上 `config.shouldStopAfterTurn` 钩子（行 247-257）允许 harness 在某个完整 turn 结束后优雅停止，终止语义其实有四层。但核心判断记住一个就够：**让模型决定"还要不要再做"，让 harness 决定"能不能信任这次尝试"。**

## 四、工具批处理：默认并行，顺序保真

一个消息里可以带多个工具调用。执行策略（`executeToolCalls`，行 411-426）：默认并行，唯一例外是全局 `toolExecution: "sequential"` 或某个工具声明了 `executionMode: "sequential"`（比如 `git` 系列命令之间有依赖）。

并行执行的代码路径（行 489-554）有个容易做错的细节：**结果回填必须保持调用顺序**。实现方式是先把所有调用"准备"（`prepareToolCall`，行 600-668：查工具定义 → schema 校验参数 → 跑 `beforeToolCall` 钩子），把真正要执行的项包装成 thunk，`Promise.all` 并发跑完，再按原数组顺序逐个把结果写入上下文。模型侧看到的工具结果永远和它发出的调用顺序一致，即使某个工具实际先返回。顺序一致性是上下文可复现的基础——模型依赖"第 N 个结果对应第 N 个调用"来推理下一步。

每个工具执行还带两个钩子：`beforeToolCall` 可以 `block`（携带 reason，甚至 `terminate`），是权限门禁/路径保护的挂点（0.84 系列扩展示例里的 permission-gate、protected-paths 就是用它实现的）；`afterToolCall` 可以改写结果内容、用量和 terminate 标记（行 724-751）。**权限策略不是散落在工具代码里，而是统一钩在循环上**——这是"刻意不做权限弹窗"却能由扩展补上的关键（08 篇展开）。

## 五、循环的可观测性：11 种事件，一个视图

循环每一次"心跳"都通过 `emit` 发出事件，共 11 种：`agent_start / turn_start / message_start / message_update / message_end / tool_execution_start / tool_execution_update / tool_execution_end / turn_end / agent_end`（加 `tool_execution_start` 与 `tool_execution_update` 两类流式增量）。interactive 模式、`--mode json`、RPC、SDK 四种运行方式全部是"订阅这个事件流"的不同客户端（行 25 的 `AgentEventSink`）。

这个设计让"Agent 在干什么"成为一等公民而不是日志：TUI 每次重绘、脚本每次 `jq` 过滤、扩展每次注入，读的都是同一份事件流。`agentLoop` 返回的 `EventStream` 以 `agent_end` 事件作为流结束标志（行 145-150）——**循环的终点就是事件流的终点**，两个概念在地步上重合。

## 六、结论：收敛是设计出来的，不是模型自带的

回到开头的命题。这个 796 行的文件回答了"Agent 怎么停下来"的完整答案，而答案不是"模型说停就停"：错误要立刻停，截断要作废重来，成功要全体确认；工具并行跑但结果必须按序；循环的每一步都有钩子可以让外部策略介入。**stopReason 是模型的，闸门是 harness 的。**

下一步你可以打开自己的 clone，在 `packages/agent/src/agent-loop.ts` 里做三件事：把 `executeToolCallsParallel` 中"按序回填"的那段（行 540-548）改成真正的乱序回填，跑一遍测试看会不会爆；给 `beforeToolCall` 加一个永远 `block` 的钩子，观察 `terminate` 如何让循环立刻收工；数一遍 `emit` 的调用点，验证 11 种事件没有遗漏。全部亲手验证后，你就能回答面试里那道"Agent 死循环了怎么办"——因为你知道闸门在哪里。

## 参考资料

- `packages/agent/src/agent-loop.ts`（796 行）与 `packages/agent/src/types.ts`，earendil-works/pi @ commit 5cd93f6（2026-08-20 浅克隆）
- `AgentTool.execute` 的抛错约定与 `AgentToolResult.terminate` 语义：`types.ts` 行 66-68 注释
- Pi 扩展示例中的权限门禁挂点：`packages/coding-agent/examples/extensions/permission-gate.ts`（07 篇展开）