---
title: "Promise.allSettled：部分成功不是错误"
description: "Promise.all 遇到第一个 reject 就短路——fan-out 场景下其余结果全被丢弃。Promise.allSettled 返回全部结果，调用方按 status 分类处理。对照实验：5 个并行 HTTP 调用，2 失败 3 成功，all 全丢 vs allSettled 拿回 3 个成功值。"
publishedAt: "2026-09-19"
tags: ["TypeScript", "错误处理", "并发", "Promise"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** `Promise.all` 是"全对才对"——任一 reject 立即短路，调用方拿不到其余结果；`Promise.allSettled` 是"全做完再说"——返回 `{ status: "fulfilled", value }` 或 `{ status: "rejected", reason }` 数组，由调用方决定哪些算成功、哪些要重试或忽略。这是 Go `errgroup` 的"继续等其余 goroutine"语义在 JS 里的对应物——Go 的 `errgroup.Go` 不会因为一个 goroutine 报错就取消其余 goroutine 的执行，JS 的 `Promise.allSettled` 同理。实验：5 个并行工具调用（3 成功 + 2 超时），all 全丢 vs allSettled 拿回 3 个。

## 一、为什么 all 不够用

Go 的 `errgroup` 模式：

```go
g, ctx := errgroup.WithContext(ctx)
for _, item := range items {
  item := item
  g.Go(func() error {
    return process(ctx, item) // 一个报错，其余继续跑
  })
}
err := g.Wait() // 收集所有结果；err 是第一个非 nil
```

一个 goroutine 失败不影响其余 goroutine 执行——`errgroup` 只是帮你收集第一个错误。

JS 的 `Promise.all`：

```ts
await Promise.all([p1, p2, p3, p4, p5]); // p2 reject → 立即 reject，p3/p4/p5 的结果丢弃
```

短路行为在 fan-out 场景下是灾难性的：5 个并行工具调用，1 个超时，其余 4 个的结果全丢了。

## 二、Promise.allSettled 的返回格式

```ts
const results = await Promise.allSettled([
  fetch("/api/users"),      // fulfilled
  fetch("/api/orders"),     // rejected (timeout)
  fetch("/api/products"),   // fulfilled
  fetch("/api/inventory"),  // rejected (timeout)
  fetch("/api/pricing"),    // fulfilled
]);

// results:
// [
//   { status: "fulfilled", value: Response },
//   { status: "rejected", reason: TimeoutError },
//   { status: "fulfilled", value: Response },
//   { status: "rejected", reason: TimeoutError },
//   { status: "fulfilled", value: Response },
// ]
```

每个元素是 discriminated union：读 `status` 才能访问 `value` 或 `reason`——类型系统强制你处理两种情况。

## 三、实用模式：分类 → 重试 → 降级

```ts
const results = await Promise.allSettled(toolCalls.map((call) => runTool(call)));

const succeeded = results
  .filter((r) => r.status === "fulfilled")
  .map((r) => r.value);

const failed = results
  .filter((r) => r.status === "rejected")
  .map((r) => r.reason);

if (failed.length > 0) {
  console.warn(`${failed.length}/${results.length} tools failed:`, failed);
}

return { succeeded, failed };
```

**关键**：`succeeded` 和 `failed` 的类型不相关——`Promise.allSettled` 不保证每个元素是相同类型，实际使用时通常是 `Promise.allSettled<T[]>(promises)`，每个 promise 返回 `T`，settled 结果是 `{ status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }`。

## 四、与 AbortSignal 的配合

AbortSignal 取消场景下，`Promise.allSettled` 能拿回"被取消的"和"已完成的"：

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 50); // 50ms 后取消所有

const results = await Promise.allSettled(
  urls.map((url) => fetch(url, { signal: controller.signal }))
);
// fulfilled: fetch 在 50ms 内完成的
// rejected: AbortError: The operation was aborted
```

配合 [AbortSignal 管不到的副作用](/writing/abort-signal-tool-side-effects)：被 abort 的 promise 已经发出了请求（副作用已提交），`allSettled` 只是告诉你它被取消了，不代表没花钱。

## 五、何时用 all，何时用 allSettled

| 场景 | 选择 | 原因 |
| --- | --- | --- |
| 必须全部成功（事务性） | `Promise.all` | 一个失败 = 整体失败 |
| 部分成功可接受（fan-out） | `Promise.allSettled` | 拿回结果再分类 |
| 需要 fail-fast 但保留已发请求结果 | `Promise.allSettled` + `AbortController` | 50ms 取消 + 等其余完成 |
| Go errgroup 等价物 | `Promise.allSettled` | 部分失败继续执行 |

## 六、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 实验 | `experiments/node-als-context/demo.mjs`（ALS 场景下并发 settle 行为） |
| 不支持结论 | allSettled 的内存/时间开销 vs all——无压测对比 |

## 参考资料

- MDN：`Promise.allSettled`（2026-09-19 核对）
- TC39 `Promise.allSettled` proposal（Stage 4，ES2020）
- 前篇：AbortSignal 取消边界，`/writing/abort-signal-tool-side-effects`
- 前篇：错误处理 throw vs Result，`/writing/typescript-errors-result-throw`
