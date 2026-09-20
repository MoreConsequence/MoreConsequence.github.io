---
title: "Node 没有 channel，也没有 AsyncEventEmitter"
description: "实测 Node v24 的 node:events 导出表：无 AsyncEventEmitter。EventEmitter.emit 是同步的且不等 async 监听器；跨 worker 发布订阅用 BroadcastChannel。5 断言：E1/E2/E2b/E4 全过，E3 因 API 不存在跳过。"
publishedAt: "2026-09-20"
tags: ["Node.js", "EventEmitter", "并发", "TypeScript"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** Go 有 channel；Node 没有。也没有 `AsyncEventEmitter`——Node v24.19.0 实测 `node:events` 导出表（`EventEmitter, EventEmitterAsyncResource, on, once…`）里根本没这一项，别再从博客抄 `new AsyncEventEmitter()`。Node 的三件套各管一摊（`experiments/node-eventemitter/demo.mjs`）：`EventEmitter.emit` 是**同步**的（监听器全跑完才返回，`L1,L2,after-emit`）；但 `async` 监听器的 Promise **不等**（emit 返回时 `pending=0`，副作用 60ms 后才到）；跨 worker 广播用 `BroadcastChannel`（同名投递，`{"hello":"worker"}` 实测到达）。

## 一、emit 同步意味着什么

```ts
emitter.on("x", () => { order.push("L1"); });
emitter.on("x", () => { order.push("L2"); });
emitter.emit("x");
order.push("after-emit"); // L1,L2,after-emit：emit 是函数调用，不是投递
```

`emit` 不是"发消息"，是"依次调用函数"。监听器抛异常会直接炸到 `emit` 调用方；监听器里 `await` 的部分，`emit` 不等——这是生产里"事件发出去了但副作用没完"的根因。想要"等所有监听器做完"，自己 `await Promise.all(listeners.map(...))`，或把监听器做成返回 Promise 并由调用方收集。

## 二、AsyncEventEmitter 不存在（已验证）

曾有提案讨论串行 await 监听器的发射器，但截至 Node v24 它不在公开 API 里。替代方案：

```ts
// 串行 await 监听器：自己写三行
for (const fn of listeners) await fn(payload);
```

别为一个三行函数引入依赖 Audited 的"polyfill"。

## 三、跨 worker：BroadcastChannel

同名 `BroadcastChannel` 在主线程和 worker 间互通，消息走结构化克隆（不是共享内存——大对象看[共享内存篇](/writing/node-shared-memory-atomics)）。注意 `bc.close()` 要显式调，否则进程不退出；且它只跨线程，跨进程请用 `fork` + IPC（见[多进程篇](/writing/node-cluster-ipc)）。

## 四、选型表

| 场景 | 用什么 |
| --- | --- |
| 进程内同步通知 | `EventEmitter`（记住 emit 同步） |
| 进程内且要等 async 监听器 | 手动收集 Promise |
| 跨 worker 广播 | `BroadcastChannel` |
| 跨进程 | `child_process.fork` + IPC |
| 背压/多生产者队列 | 以上都不是——回主线程中转或 SAB 环形缓冲 |

## 五、证据卡与边界

原始输出：`evidence/node-eventemitter/`（2026-09-20-local，Node v24.19.0）。E3 跳过即证据（导出表无此项）。不支持：`emit` 在十万级监听器下的耗时——无压测，未验证。

## 参考资料

- Node.js 文档：events、worker_threads BroadcastChannel（2026-09-20 核对，导出表实测）
- 前篇：共享内存与 Atomics，`/writing/node-shared-memory-atomics`
- 前篇：多进程 IPC（本批），`/writing/node-cluster-ipc`
