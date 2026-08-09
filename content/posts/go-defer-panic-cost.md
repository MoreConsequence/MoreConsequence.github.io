---
title: "defer 的真相：4ns 的日常、135ns 的循环税，与 67ns 的 panic"
description: "defer 不贵——大多数时候。Go 1.14 的 open-coded defer 让普通 defer 只比直接调用贵 2ns（实测 4.4 vs 2.4ns），甚至可免费。真正的税在循环里：循环内 defer 无法 open-code，走 deferproc 堆分配，实测 135ns/次 + 2 allocs（vs 直接调用 2.2ns，61 倍差）。panic/recover 反直觉地便宜：浅层 67ns、深 100 层 906ns（每层 8.4ns 展开税），比 error 返回（1.3ns）贵 50 倍但绝非毫秒级灾难。本机实测 Go 1.25.1。"
publishedAt: "2026-08-14"
updatedAt: "2026-08-14"
tags: ["Go", "性能优化", "错误处理"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** defer 的成本取决于位置：**函数尾部的一次性 defer 几乎免费**（Go 1.14 的 open-coded defer 把它展开成内联代码，实测只比直接调用贵 2ns）；**循环里的 defer 是 61 倍税**（无法 open-code，走 `deferproc` 堆分配，实测 135ns/次 + 2 allocs vs 直接调用 2.2ns）；**panic/recover 没有传说中那么贵**——浅调用链 67ns、100 层深 906ns（展开税每层 8.4ns），与 error 返回（1.3ns）的差距是 50 倍量级而非毫秒级。生产规则：defer 放心用，但别放进循环；异常路径用 panic/recover 前先想清楚调用深度。

## 一、open-coded defer：为什么函数尾部的 defer 免费

Go 1.14 引入 open-coded defer：当函数尾部（编译器可证明的返回路径）的 defer 满足条件（数量有限、无循环、可内联）时，不再注册到运行时 defer 链表，而是**直接展开成返回路径上的普通调用**。本机实测（Go 1.25.1，arm64 8 核）：

| 调用方式 | ns/op |
|---|---|
| 直接函数调用 | 2.4 |
| `defer func() { ... }()`（闭包捕获返回值） | **4.4** |
| `defer noDefer(x)`（defer 直接调函数） | **2.2** |

defer 一个可内联的函数甚至和直接调用同价——这就是为什么"defer 有开销"是过时知识：**函数尾部的 defer 已经是编译期展开的代码，不是运行时注册**。日常代码里 `defer f.Close()`、`defer mu.Unlock()` 的成本可以忽略。

## 二、循环里的 defer：61 倍税的真实来源

defer 一旦出现在循环体内，编译器无法 open-code（每轮迭代都是独立的动态注册），只能走运行时慢路径 `deferproc`：**每次迭代堆分配一个 `_defer` 结构 + 注册进 goroutine 的 defer 链表**，函数返回时 `deferreturn` 再逐个取出执行。实测（循环 100 次迭代，每次一个 defer）：

| 模式 | 总耗时 | 每轮成本 | allocs |
|---|---|---|---|
| 循环内每次 defer | 13498ns | **135ns** | 199 |
| 循环内直接调用 | 219.7ns | **2.2ns** | 0 |

**61 倍差距，全部来自堆分配**（每轮 2 allocs）。这解释了静态检查工具（staticcheck SA4006 等）为什么警告循环内 defer：不是 defer 本身贵，是它在该场景被迫走最贵路径。修复方式是移出循环（包一层函数）或改用显式释放。

## 三、panic/recover：67ns 的真相与展开税

panic 的真实成本是两段：**构造与抛出的固定开销 + 栈展开的线性税**。实测：

| 场景 | ns/op |
|---|---|
| panic + recover（1 层调用链） | **66.6** |
| panic + recover（100 层递归） | **906.4** |
| error 返回（不可内联的对照） | 1.3 |

读法：

1. **浅层 panic/recover 不贵**：67ns 甚至比《[Go 锁成本](/writing/go-lock-cost-futex-rwlock)》实测的 Mutex（106ns）便宜。gopanic 的展开只需遍历当前栈帧找 defer——一层就是几十 ns。
2. **展开税每层 8.4ns**：100 层 906ns，多出的 840ns 全是逐帧展开（遍历栈帧、检查 open-coded defer 位图）。**深调用链上 panic 的成本线性累积**——递归/深栈场景用 panic 做控制流，深度 1 万层就是 90µs。
3. **与 error 返回的差距是 50 倍**：1.3ns vs 67ns。这个差距在"每请求一次"的异常路径上无所谓，在"每元素一次"的热循环里不可接受。

另一个 hidden cost：**不 recover 的 panic 会打印全栈**（1M 层递归的栈回溯本身就是 ms 级）且进程退出——panic 的贵不是性能，是它终止进程的语义。

## 四、defer 与 panic 的分工：谁该用谁

| 场景 | 选择 | 依据 |
|---|---|---|
| 资源释放、锁解锁（函数尾部） | defer，放心用 | 2~4ns，open-coded 展开 |
| 循环内的清理逻辑 | 移出循环或显式调用 | 135ns/次 + 2 allocs 的税 |
| 异常路径（一次调用链上的失败） | panic/recover 可用 | 67ns，与 error 50 倍差但绝对值小 |
| 深度递归内的失败传播 | 用 error | 展开税 8.4ns/层线性累积 |
| 跨 goroutine 传播错误 | error/通道 | panic 不跨 goroutine 传播 |

一个常被误解的点：**recover 只能在 defer 里生效**（panic 展开时按 defer 链表执行，recover 必须在展开路径上）——这不是性能设计，是语义设计：recover 站在"清理链"上看栈，与 defer 的注册顺序绑定。

## 结论

defer 的性能真相是位置的函数：尾部一次性 defer 被 open-coded 成 2~4ns 的免费路径；循环内 defer 被迫走 135ns + 2 allocs 的堆分配税（61 倍）；panic/recover 是 67ns 起步 + 每层 8.4ns 的展开税，比 error 贵 50 倍但远没到"别用"的程度。选择标准一句话：**defer 看位置，panic 看深度**。

下一步可做的事：grep 代码里循环体内的 defer（`for` 块内缩进的 `defer`），全部移出；评估你代码里 panic/recover 的使用深度，超过 100 层的改 error。

## 参考资料

1. Go 源码 `runtime/panic.go`（deferproc/deferreturn/gopanic/gorecover）—— Go 1.25.1 本机源码
2. Go 1.14 Release Notes（open-coded defers）—— https://go.dev/doc/go1.14
3. 前作：[Go 锁成本](/writing/go-lock-cost-futex-rwlock)、[goroutine 栈的成长](/writing/go-goroutine-stack-growth)