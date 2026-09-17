---
title: "Node 并发两问：上下文隔离与 CPU 下放"
description: "AsyncLocalStorage.run 让 10 并发 tenant 隔离 10/10 全对（共享变量只对 1/10），worker_threads 让被 busy 推迟 40ms 的 timer 回到 1ms。两组对照全过，同一主题：先分清等待与计算，再选工具。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-16"
tags: ["Node.js", "并发", "事件循环", "TypeScript"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** Node 并发的两个经典坑一次对照：共享变量在 10 并发 + 20ms 异步缺口下只有 1/10 读对，`als.run({id})` 包住 handler 则 10/10 全对；主线程 `busy(50ms)` 让 10ms timer 迟到 40ms，同一计算搬进 `worker_threads` 后误差 1ms。两组断言全过（2+2）。铁律：I/O 等待用 `await` 让出，CPU 忙等下放 worker——先分类，再动手。

## 一、问一：请求上下文丢在哪

异步缺口是串号的根因：同步代码里共享变量永远正确，第一个 `await` 之后听天由命。铁律三条：入口处 `run`（不用裸 `enterWith`）、store 只读、日志 trace 全从 store 取 id（`experiments/node-als-context/demo.mjs`，3 断言）。加固 A3：嵌套 `run` 内层覆盖外层、退出恢复（`["outer","inner","inner"]`）——中间件叠加不互踩。

## 二、问二：CPU 下放给谁

P0-05 点名的 worker 缺口至此闭环：协作等待让出、CPU 忙等下放是两条不同的路，大对象跨线程用 transferList（`experiments/node-worker-offload/demo.mjs`）。

## 三、证据卡与边界

原始输出：`evidence/node-als-context/`、`evidence/node-worker-offload/`（2026-09-14-local）。不支持：`run` 本身开销、worker 池调度、多核扩展比。

## 参考资料

- Node.js 文档：async_context、worker_threads（2026-09-14 核对）
- 前篇：事件循环 vs GMP，`/writing/typescript-event-loop-vs-gmp`
