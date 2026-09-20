---
title: "AsyncLocalStorage 深度：请求 ID 为什么会串号"
description: "Node 的 context.Context 等价物是 AsyncLocalStorage。实验：10 并发请求各自追踪 request-id 跨三层异步调用，证明共享变量串号而 ALS 不串号；补 worker_threads 边界——context 不穿越线程。"
publishedAt: "2026-09-19"
tags: ["Node.js", "AsyncLocalStorage", "上下文传播", "TypeScript"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** Go 工程师把 `context.Context` 当空气——中间件塞、下游掏，签名里永远有个 `ctx`。Node 没有这个签名位置；`AsyncLocalStorage` 是它的等价物，但用法反直觉：不是"传"进去的，是"泡"在异步树里的。实验：10 并发请求各自携带 `request-id`，经过 middleware → service → repo 三层异步调用——共享变量只对 1/10 请求正确，ALS 10/10 全对。补一条边界：ALS 上下文**不穿越 `worker_threads`**——跨线程要用 `workerData` 或 `postMessage` 显式传递，这点和 Go 的 `context.WithValue` 在 goroutine fork 后不自动继承是同一条规则。

## 一、Go 的 ctx 和 Node 的 ALS 是同一条规则

| 维度 | Go `context.Context` | Node `AsyncLocalStorage` |
| --- | --- | --- |
| 传递方式 | 显式参数（签名里有个 `ctx`） | 隐式浸泡（`store.run(value, callback)` 后，callback 及其异步后代都能读到） |
| 语法强制 | 编译器强制（`ctx` 不传就编译不过） | 无强制——忘了 `run` 就串号，运行时才暴露 |
| 跨线程 | goroutine 不继承父 context（要显式传） | worker_threads 不继承 ALS（要显式传 `workerData`） |
| 嵌套 | `context.WithValue` 层层覆盖 | `store.run` 嵌套，内层覆盖外层，退出自动恢复 |

核心区别：Go 用签名强制你不漏，Node 用约定——漏了不会报错，只会静默串号。

## 二、串号怎么发生的

```ts
// ❌ 共享变量：10 并发只有 1 个请求 ID 对
const currentRequestId = "";

app.use(async (req, res, next) => {
  currentRequestId = req.headers["x-request-id"] || crypto.randomUUID();
  await next(); // ← await 让出后，另一个请求可能覆盖 currentRequestId
});
```

10 个请求几乎同时到达，每个都设置 `currentRequestId`，但 `await next()` 是异步的——handler 里读到的 `currentRequestId` 可能是别人设的。结果：10 个请求日志里混着别人的 ID。

## 三、ALS 的正确用法

```ts
import { AsyncLocalStorage } from "node:async_hooks";

const requestIdStore = new AsyncLocalStorage();

// middleware：set
app.use(async (req, res, next) => {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  requestIdStore.run({ requestId }, () => next());
});

// handler / service / repo：get
async function getUser(id: number) {
  const { requestId } = requestIdStore.getStore() ?? {};
  console.log(`[${requestId}] fetching user ${id}`);
  // ...三层异步调用下去，requestId 始终可读
}
```

`run` 创建一个异步作用域：callback 及其所有 `await` 后代都在这个 scope 内——10 个并发请求各有各的 scope，互不干扰。

## 四、worker_threads 边界：context 不穿越

```ts
import { Worker } from "node:worker_threads";

const store = new AsyncLocalStorage();

store.run({ requestId: "req-42" }, async () => {
  console.log("main:", store.getStore()); // { requestId: "req-42" }

  const worker = new Worker("./worker.js");
  await new Promise((resolve) => worker.on("message", resolve));

  console.log("main after worker:", store.getStore()); // ✅ 仍在
});
```

```js
// worker.js
import { parentPort } from "node:worker_threads";
// ❌ 这里 store.getStore() 是 undefined —— context 不穿越线程
parentPort.postMessage("done");
```

**跨线程传递方式**：用 `workerData`（创建时传）或 `postMessage`（运行时传）。Go 的 goroutine 也是同理——`go func(ctx)` 里的 ctx 不会自动拿到父 goroutine 的最新值，要显式传。

## 五、调试三招

1. **`AsyncLocalStorage.symbol`**：`AsyncLocalStorage.contextId`（Node 22+）可在 debugger 里直接看到当前 store
2. **中间件加日志**：`store.run` 入口打印 requestId，`await next()` 出口打印——确认 scope 闭合
3. **看丢失点**：如果下游 `store.getStore()` 返回 undefined，说明 `run` 没包住这段调用链——补中间件或补 `run`

## 六、性能边界

ALS 每次异步操作创建新的 context 对象。高 QPS 场景下：
- GC 压力增加（context 对象随 async 操作生命周期创建/销毁）
- 连接池场景下 context 可能泄漏到复用连接（pool 不感知 store scope）
- **不用 ALS 的替代方案**：日志场景用 `pino` 的 `child({ requestId })`，trace 场景用 OpenTelemetry 的 `context.with()`（底层也是 ALS，但封装了 propagation 协议）

## 七、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 实验 | `experiments/node-als-context/demo.mjs`：10 并发，共享变量 1/10 正确，ALS 10/10 正确 |
| 证据目录 | `evidence/node-als-context/`（2026-09-14-local） |
| 不支持结论 | ALS 的绝对性能开销（每请求纳秒级），高 QPS 下 GC 压力的量化数字——无压测工具，未验证 |

## 参考资料

- Node.js 文档：`async_hooks`（2026-09-14 核对）
- OpenTelemetry JS SDK `context` propagation（2026-09-19 核对 README）
- 前篇：事件循环 vs GMP（上下文隔离的原理），`/writing/typescript-event-loop-vs-gmp`
- 前篇：并发两问（ALS 隔离 + worker 下放），`/writing/node-concurrency-context-cpu`
