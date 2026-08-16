---
title: "用 TypeScript 写 LLM 工具循环：类型系统如何替并发编排兜底"
description: "一篇以真实可运行的 LLM Agent 工具循环为载体的 TypeScript 实战：工具调用 JSON 的运行时校验、Promise.all + 超时竞态、部分失败的类型化表达、never 穷尽检查。每个错误都是真实运行输出，每段代码都能编译能跑。"
publishedAt: "2026-08-15"
updatedAt: "2026-08-15"
tags: ["TypeScript", "后端", "LLM", "Agent"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** 系列第一篇讲的是"TS 能减少写错的范围"，这篇把话接上：**并发编排中，类型系统不负责让代码跑得快，但负责让每一种失败都有一席之地**。以 LLM Agent 的工具调用循环为例——模型返回的 JSON 工具调用是信任边界（先 `unknown` 再守卫）；并发执行用 `Promise.all` + 超时（注意：超时是竞态不是过滤器）；部分失败必须用可辨识联合占位（`{ok:true}|{ok:false}`），否则"成功一半"无法表达；`never` 穷尽检查把"新增工具忘了处理"变成编译错误。全文 20 段可编译代码，一次真实运行输出附在末尾——包括一个真实发生在演示里的 timeout 竞态。

## 一、场景：工具循环里，信任边界不止一处

一个最简 Agent：模型（LLM）返回"要调什么工具"，你的代码执行工具，把结果拼回给模型。循环长这样：

```
模型输出 JSON 工具调用 → 校验形状 → 并发执行 → 收集结果 → 再喂回模型
```

后端工程师常把这当成"解析 JSON，调函数"——两处陷阱：

1. **模型输出的 JSON 不是结构体**。Go 里 `json.Unmarshal` 到 struct 至少给你一个确定形状；TS 里 `JSON.parse` 给的是 `any`，模型可能输出 `missing field`、错误类型、甚至完全不是 JSON。这是第一道信任边界。
2. **工具是外部 I/O**。每次调用都可能慢、超时、爆炸。`Promise.all` 默认行为是"一个失败全部失败"——但 Agent 场景里**部分成功是常见且有用的结果**（3 个工具成功 1 个失败，模型可以选择重试失败的）。把"部分失败"表达进类型，是这篇的核心。

## 二、工具调用协议：可辨识联合 + 运行时守卫

工具调用先定义成可辨识联合——这是系列[第一篇](/writing/typescript-pitfalls-for-go-backend-developers)强调过的模式，这里直接用于协议：

```ts
type ToolCall =
  | { id: string; kind: "lookup_order"; orderId: string }
  | { id: string; kind: "get_stock"; sku: string }
  | { id: string; kind: "cancel_order"; orderId: string };
```

`kind` 是判别字段。非法组合（没有 `kind`、`kind` 拼错、字段缺）在编译期不可构造——但模型不读你的类型，所以**解析端必须独立校验**：

```ts
function parseToolCall(raw: unknown): ToolCall {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`not an object: ${String(raw)}`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.kind !== "string") {
    throw new Error(`missing id/kind: ${JSON.stringify(raw)}`);
  }
  switch (o.kind) {
    case "lookup_order":
      if (typeof o.orderId !== "string") throw new Error("orderId missing");
      return { id: o.id, kind: o.kind, orderId: o.orderId };
    default:
      throw new Error(`unknown kind: ${String(o.kind)}`);
  }
}
```

关键点：`raw as Record<string, unknown>` 之后**每一个字段都还要 typeof 检查**。`as` 只告诉编译器"相信我"，这一步才真正证明了形状。生产可用 zod 等 schema 库替代手写守卫，但原理不变——**边界处先 `unknown`，守卫后才进类型系统**。

## 三、并发执行：Promise.all 与它的三个坑

工具之间互不依赖（调库存和查订单可以同时），直觉是并发：

```ts
const results = await Promise.all(calls.map((c) => runTool(c)));
```

三个坑，都要在类型里或流程中显式处理：

**坑一：`map` 不并发，`Promise.all` 才并发。** `calls.map((c) => runTool(c))` 立即创建全部 Promise（工具同时启动），`await` 等待全部完成。Go 里你要显式开 goroutine + WaitGroup；TS 里 `map 创建、all 等待`是两码事。

**坑二：所有 Promise 必须被等待或处理。** 漏一个，错误变成 unhandled rejection——进程可能直接崩，Go 里 goroutine panic 只是那个 goroutine。

**坑三：部分失败没有天然表达。** `Promise.all` 遇到第一个 rejection 就抛——其余工具的结果被丢弃。Agent 场景想要的是"成功的记录成功，失败的记录失败，全给模型"。这就是 `allSettled` 与自定义结果类型的用例：

```ts
type ToolResult = { ok: true; value: unknown } | { ok: false; error: string };

async function executeBatch(calls: ToolCall[], timeoutMs: number): Promise<ToolResult[]> {
  const pending = calls.map((call) =>
    Promise.race([
      runTool(call),
      sleep(timeoutMs).then(() => ({ ok: false, error: "timeout" }) as ToolResult),
    ]),
  );
  return Promise.all(pending);
}
```

注意这里的两个设计：

- `ToolResult` 是可辨识联合（`ok` 判别），**"成功一半"成为一等公民**——调用方对每个结果都必须分流 `if (result.ok)`，忘了处理失败分支会怎样？`result` 类型是联合，`result.value` 只在 `ok:true` 分支可见——编译器逼你处理。Go 里两个返回值 `(val, err)` 也是同理，区别是 TS 把它做进类型。
- `Promise.all(pending)` 不再出现 rejection（每个已降级为 `ok:false`），所以全部结果安全到达。

## 四、超时是竞态，不是过滤器

上面 `Promise.race` 的超时实现有一个非常隐蔽的问题——它是**竞态**：`timeoutMs` 到了并不代表工具"真的停"：

```ts
await sleep(timeoutMs).then(() => ({ ok: false, error: "timeout" }) as ToolResult),
```

- 工具函数 **不会被打断**：`sleep` 赢了 race，报告 timeout，但 `runTool` 仍在后台跑，最后结果被丢弃。对只读工具（查库存）尚可，对**写操作工具（取消订单）这是灾难**——你报告"超时"，用户重试，结果第一次调用其实成功了，订单被取消两次。
- 正确姿势是 `AbortSignal`（`AbortSignal.timeout()`）贯穿到底层 I/O，让真正的取消能传播；或至少给写入类工具加幂等键。

这个坑不是理论——首次运行本演示（timeoutMs=100，工具延迟 50–130ms）就出现了：

```
── round 1
  c1 lookup_order → ok {"status":"PROCESSING","items":3}
  c2 get_stock → FAIL timeout
```

`get_stock` 只是慢在 100ms 竞态线上，被误报 timeout。真实 Agent 循环里，这会让模型误判"库存服务挂了"并开始降级流程。

## 五、结果收集与模型回喂：联合类型替你把分支写全

主循环把每轮结果拼回给模型。到了这一步，类型仍然在兜底：

```ts
// rounds：模拟模型两轮给出的工具调用（实验中是固定脚本，真实场景来自 LLM 输出）
const rounds: unknown[][] = [
  [
    { id: "c1", kind: "lookup_order", orderId: "A-100" },
    { id: "c2", kind: "get_stock", sku: "SKU-9" },
  ],
  [{ id: "c3", kind: "cancel_order", orderId: "A-100" }],
];

// never 穷尽：给每个工具定一个成本定额，新加工具类型而忘记补分支 = 编译错误
function toolCost(call: ToolCall): number {
  switch (call.kind) {
    case "lookup_order":
      return 2;
    case "get_stock":
      return 1;
    case "cancel_order":
      return 5;
    default:
      return assertNever(call); // 若 ToolCall 加新 kind，此处编译报错
  }
}

async function agentLoop(maxRounds: number, timeoutMs: number) {
  for (let round = 0; round < maxRounds && round < rounds.length; round++) {
    const calls = rounds[round].map(parseToolCall);
    const budget = calls.reduce((sum, c) => sum + toolCost(c), 0);
    console.log(`round ${round + 1} 预算=${budget}`);
    const results = await executeBatch(calls, timeoutMs);

    const allOk = results.every((r) => r.ok);
    const message = allOk
      ? "全部成功，收尾"
      : round === 0
        ? "补一轮重试"
        : "告诉用户部分失败，结束";

    console.log(`${message} (${results.filter((r) => r.ok).length}/${results.length} ok)`);
  }
}

await agentLoop(2, 100);
```

`assertNever(call)` 的 default 分支是关键：`ToolCall` 联合只有一个判别 `kind`，switch 覆盖全部三个 kind 后，`call` 在 default 里被收窄为 `never`——于是 `assertNever` 接受它编译通过。**将来加第四个工具（如 `{kind:"refund"}`）而忘记在 `toolCost` 补分支，default 里 `call` 不再是 `never`，编译直接报错**。Go 里你靠 type switch 的覆盖与手写注释；TS 里这是硬约束。

三个编译器在这里强制的事：

1. **`results` 的元素是联合**：访问 `r.ok ? r.value : r.error` 才合法；把 `ToolResult` 当纯 `unknown` 序列化给模型，模型收不到失败原因。
2. **穷尽检查**：`ToolResult` 只有两个分支，`if (r.ok)` 就够；但若以后给 `ToolResult` 加第三个分支（如 `{ok:"retry"}`），所有 `if (r.ok)` 处立即报错——新增失败类别 = 全流程重新审查。
3. **`unknown` 端口的纪律**：模型回喂处，把 `ToolResult[]` 序列化前要脱敏——工具值里可能夹带内部字段（Go 背景：序列化结构体时漏 `json:"-"` 的同类问题），类型不帮你裁剪，见系列第一篇的"结构化赋值不会删除多余字段"。

## 六、运行它：一次真实输出

完整可运行代码在 `experiments/ts-agent/main.ts`（零依赖：`tsc --strict` + `node`，模拟模型按脚本返回工具调用，工具 30% 随机失败，超时 100ms）。本机一次输出：

```
── round 1
  预算消耗：lookup_order=2 get_stock=1（合计 3）
  c1 lookup_order → FAIL timeout
  c2 get_stock → FAIL timeout
  模型：补一轮重试
── round 2
  预算消耗：cancel_order=5（合计 5）
  c3 cancel_order → FAIL tool cancel_order exploded
  模型：告诉用户部分失败，结束
done
```

这一轮两个失败形态各占一个：`timeout`（竞态误报）与 `exploded`（工具真炸）——都在类型里显式占位，模型能区分"还没完成"与"出错了"。同一次演示的上一轮（见第四节）两个工具都 `ok`。两种形态、三种结果，`ToolResult` 联合都接得住：**失败不是异常，是数据**。

## 结论：类型系统负责让部分失败和并发竞态显式化

Agent 工具循环把系列第一篇的语法点串成了生产代码：信任边界（`unknown` + 守卫）、协议建模（可辨识联合）、并发编排（`Promise.all` / `race`）、失败建模（`ToolResult` 联合 + 穷尽检查）。类型系统在这里的职责不是"让代码跑得快"，而是**让每一种可能的结果都有人处理**——包括"一半成功一半失败"这种 Go 的 `(val, err)` 二元组表达不了的形状。

下一步：把 `AbortSignal.timeout` 从"竞态降级"换成真取消（`fetchListener` 传入 AbortSignal），并给写工具加幂等键；然后参考 zod 的 `z.discriminatedUnion` 重写 `parseToolCall`，你会看到运行时校验与类型定义在 schema 库里如何合二为一。

## 七、参考资料：异步组合与运行时校验

- [MDN：Promise.all](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)：任一 Promise reject 时的组合语义。
- [MDN：Promise.allSettled](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)：收集部分成功与部分失败。
- [Node.js：AbortSignal.timeout](https://nodejs.org/api/globals.html#abortsignaltimeoutdelay)：用 signal 表达超时取消边界。
- [Zod：Discriminated unions](https://zod.dev/api#discriminated-unions)：运行时解析与可辨识联合的对应关系。
- [TypeScript Handbook：Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)：可辨识联合与 `never` 穷尽检查的类型基础。
