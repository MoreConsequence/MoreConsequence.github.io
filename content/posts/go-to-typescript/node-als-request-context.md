---
title: "Node ALS 请求上下文：10 并发下共享变量只对 1 个"
description: "AsyncLocalStorage.run 给每个请求独立 store：10 并发 tenant 隔离 10/10 全对；模块级共享变量同场景只对 1/10（全读到最后一个 id）。附可重跑 demo 与三条使用铁律。"
publishedAt: "2026-09-14"
tags: ["Node.js", "TypeScript", "并发", "可观测性"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** Node 单线程不等于请求隔离：模块级 `current` 变量在 10 并发下只有 1/10 读对（全串成最后一个 id），`als.run({id})` 包住 handler 则 10/10 全对。2 断言全过（Node v24.19.0）。铁律三条：入口处 `run`（不用 `enterWith` 裸奔）、只读不写 store、日志/trace 全从 store 取 id。

## 一、完整路径：请求 id 在哪里丢的

```text
请求进 → current = id（共享变量被覆盖 10 次）
  → await 20ms（事件循环切走，剩下 9 个请求依次覆盖）
  → 读 current → 全是 req-9
vs
请求进 → als.run({id})（上下文绑到异步链）
  → await 20ms（链不断）
  → als.getStore().id → 各自的 id
```

串号的根因不在并发，在**异步缺口**：同步代码里共享变量永远正确，第一个 `await` 之后就听天由命。这也是“本地压测通过、上线串号”的经典形状——单并发永远对。

## 二、合同

| 维度 | als.run | enterWith | 共享变量 |
| --- | --- | --- | --- |
| 隔离 | 异步链全程携带 | 当前链有效，易在回调中丢 | 无 |
| 成本 | 每次 run 建上下文（可测，另篇） | 同左 | 0 |
| 误用 | 忘了 run 则 getStore() 为空（loud） | 静默串号（最毒） | 同左 |
| 调用者负责 | 中间件统一包、store 只读 | 能不用就不用 | 别用 |

## 三、实测

`experiments/node-als-context/demo.mjs`，`evidence/node-als-context/2026-09-14-local/run.out`：`GOOD 10/10，BAD 1/10`，2 PASS。

## 四、证据卡与边界

环境 Darwin arm64 + Node v24.19.0。不支持：`run` 本身的性能开销（需压测）、worker_threads 跨线程传递（store 不跨线程，得显式传）。

## 参考资料

- Node.js 文档：AsyncLocalStorage，<https://nodejs.org/api/async_context.html>（2026-09-14 核对）
