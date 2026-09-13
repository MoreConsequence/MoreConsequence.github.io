---
title: "长任务推送 vs 轮询：SSE 断线续传无丢无重"
description: "Tasks 轮询的替代形状：SSE 订阅 + Last-Event-ID，断线重连只收 3、4（无重复无丢失），全量订阅 1-4 有序。用慢放 4 事件验证续传语义，并给出推送与轮询的选用表。"
publishedAt: "2026-09-14"
tags: ["Agent", "SSE", "实时", "协议设计"]
draft: false
featured: false
series: "大模型后端架构与推理加速"
---

**TL;DR：** 长任务除了 Tasks 轮询，还可以用 SSE 推送：服务端慢放 4 事件，客户端中途断线后带 `Last-Event-ID: 2` 重连，只收到 3、4（无重复无丢失），全量订阅 1-4 有序。3 断言全过。选用表：进度高频 + 客户端常在线 → SSE；客户端掉线频繁/需审计 → 轮询 taskId（状态在服务端）。

## 一、合同

| 维度 | SSE 推送 | Tasks 轮询 |
| --- | --- | --- |
| 状态在哪 | 客户端游标（Last-Event-ID） | 服务端 taskId |
| 断线 | 续传（服务端保留事件窗） | 无影响（随时查） |
| 服务端成本 | 长连接 | 存储任务 |
| 适用 | 进度流、通知 | 审计、掉线频繁端 |

## 二、实测

`experiments/sse-resume/sse.mjs`，`evidence/sse-resume/2026-09-14-local/run.out`，3 PASS。S2 的 `[3,4]` 是全文最重要的一行：续传既无 1、2 重复，也无 3、4 丢失。

## 三、证据卡与边界

环境 Node v24.19.0，进程内慢放。不支持：真实网络断线、事件窗保留策略（保留多久）、多订阅者广播。

## 参考资料

- 前篇：MCP Tasks 扩展（轮询形状），`/writing/llm-11-mcp-tasks-extension`
- SSE 规范：HTML Living Standard server-sent events
