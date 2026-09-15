---
title: "长任务状态三形状：MRTR 重试、Tasks 轮询、SSE 推送"
description: "超过一次重试的长任务有三形状：MRTR 一次闭环、Tasks 扩展 taskId 加轮询、SSE 订阅加 Last-Event-ID 续传。用三实例与慢放双原型验证，并说明存储仍需自己存、推送与轮询的选用表。"
publishedAt: "2026-09-13"
updatedAt: "2026-09-14"
tags: ["大模型工程", "MCP", "协议设计", "Agent架构"]
draft: false
featured: false
series: "大模型后端架构与推理加速"
---

**TL;DR：** 超过一次重试的长任务有三形状：MRTR 一次重试闭环；MCP Tasks 扩展（`io.modelcontextprotocol/tasks`）创建即返 `taskId`，`tasks/get` 轮询、`tasks/update` 推进度，全程不占长连接；SSE 订阅加 `Last-Event-ID` 续传，无丢无重。8 个本地断言全部通过（5 + 3），其中最关键的仍是反例 T4——没有共享任务存储的实例收不到别人的任务，Tasks 只是状态的外壳，存储仍需自己提供。

本文是 MCP 三部曲终篇（原独立 SSE 篇已并入本节第四节）。前两篇：[无状态核心](/writing/llm-09-mcp-stateless-core)（传输会话删除，短多轮走 MRTR 重试）、[A2A 发现与委派](/writing/a2a-discovery-delegation)（横向发现）。本文回答最后一个问题：**超过一次重试的长任务，状态放哪、谁来轮询——以及何时不该轮询？**

## 一、完整路径：一次迁移任务走完什么

```text
tools/call（缺参数）→ input_required
  → 带答案重试 → 立即返回 {taskId, status: running}（连接释放）
  → 服务端执行，tasks/update 推 progress
  → 客户端 tasks/get 轮询（可落在任一共享存储的实例）
  → status: done，读最终结果
```

和 MRTR 的分工：MRTR 是一次重试闭环（问→答→完成）；Tasks 是多次推进（创建→N 次进度→终端态）。分界线是“需不需要中间进度”。

## 二、合同：Tasks 保证什么、不保证什么

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 创建 | 立即返回 taskId，不阻塞连接 | 任务已开始执行（只表示已受理） | 受理 vs 开始的区分、队列 |
| 进度 | `progress` shape 与终端态可读 | 进度单调真实（服务端可乱报） | 进度语义与校验 |
| 轮询 | 任一实例可答（存储共享时） | 跨实例自动可见（T4 反例） | 任务存储：DB/Redis/共享内存三选一 |
| 通知 | `subscriptions/listen` 按需订阅（替代旧 HTTP GET 通知） | 送达一次且仅一次 | 幂等消费与重放 |
| 取消 | 形状由扩展定义 | 服务端真停（需业务配合） | 取消传播与补偿 |

## 三、实测：三实例，两种存储

C、D 共享任务存储，E 独享。源码 `experiments/mcp-tasks-extension/demo.mjs`，原始输出 `evidence/mcp-tasks-extension/2026-09-13-local/run.out`。

```text
PASS T1 长任务立即返回 taskId | taskId=task-C-1
PASS T2 共享存储下跨实例轮询 | {"taskId":"task-C-1","status":"running","progress":0.5,"owner":"C"}
PASS T3 终端状态可读
PASS T4 无共享存储即未知任务
PASS T5 传输无状态不受任务存储影响
```

T2 与 T4 是一对：D 能读到 C 创建的任务（共享存储），E 读不到（404 unknown task）。**传输无状态（T5：E 照样能创建自己的任务）与任务状态共享是正交的两件事**——删掉 session 只是删掉了隐式状态，显式状态该存还得存。凡是把“无状态协议”读成“无状态架构”的方案，T4 就是它的失败形状。

## 四、三部曲总账：状态的三次搬家

| 篇 | 状态原来在哪 | 搬到哪 | 网关/客户端的变化 |
| --- | --- | --- | --- |
| llm-09 无状态核心 | 传输 session | 请求自带 + 显式 handle | 粘性下线，改头路由 |
| a2a-agent-card | 部署文档/预配置 | Agent Card 协议消息 | 调用前先拉卡 |
| 本文 Tasks | 长连接/流 | taskId + 轮询 | 不 hold 连接，存任务状态 |

## 五、第三形状：SSE 推送对照（原独立篇并入）

轮询之外还有推送：SSE 订阅加 `Last-Event-ID`，断线重连只收错过的事件。原型慢放 4 事件（`experiments/sse-resume/sse.mjs`，原始输出 `evidence/sse-resume/2026-09-14-local/run.out`）：

```text
PASS S1 首连收到前2个 | [{"id":1,...},{"id":2,...}]
PASS S2 续传无丢无重 | [3,4]
PASS S3 全量顺序完整
```

| 维度 | Tasks 轮询 | SSE 推送 |
| --- | --- | --- |
| 状态在哪 | 服务端 taskId | 客户端游标（Last-Event-ID） |
| 断线 | 无影响（随时查） | 续传（服务端保留事件窗） |
| 服务端成本 | 存储任务 | 长连接 |
| 适用 | 审计、掉线频繁端 | 进度流、通知 |

选用即问：客户端常在线且要低延迟进度 → 推送；要审计与任意时刻查询 → 轮询。两者可共存（推送为主、轮询兜底），但状态只能有一份权威。

## 六、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 问题 | 长任务状态能否脱离长连接，且跨实例可见？推送语义能否无丢无重？ |
| 环境 | Darwin arm64，Node v24.19.0，零依赖 |
| 输入 | 三实例 + 5 断言；慢放 4 事件 + 3 断言，均为确定性运行 |
| 原始输出 | `evidence/mcp-tasks-extension/2026-09-13-local/run.out`（5 PASS） + `evidence/sse-resume/2026-09-14-local/run.out`（3 PASS） |
| 支持结论 | 创建即返、跨实例轮询、终端态、T4 反例、正交性；续传无丢无重 |
| 不支持结论 | 真实 SDK 的 Tasks 行为、DB/Redis 持久化、通知送达语义、生产轮询负载、真实网络断线 |

## 七、结论：连接归零，存储现形

Tasks 扩展把最后一块隐式状态（hold 住的流）也显式化了：连接持有时间为零，代价是多了一个必须自己选的存储。推送是同一问题的另一解，只是把状态从服务端搬到客户端游标。行动清单：一行——**给任务状态选存储（与业务数据同库、同 Redis，还是独立表），再上线 Tasks**。三部曲到此闭环。

## 参考资料

- MCP 2026-07-28 changelog（Tasks 进扩展 SEP-2663、通知改 subscriptions/listen），<https://modelcontextprotocol.io/specification/2026-07-28/changelog>（2026-09-13 核对）
- 前篇：MCP 无状态核心，`/writing/llm-09-mcp-stateless-core`；A2A 发现与委派，`/writing/a2a-discovery-delegation`
- 推送对照实验：`experiments/sse-resume/sse.mjs` + `evidence/sse-resume/2026-09-14-local/run.out`（原独立 SSE 篇已并入本文第五节）
