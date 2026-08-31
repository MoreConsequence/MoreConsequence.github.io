---
title: "defer 的真相：3ns 的日常、30ns 的循环税，与 74ns 的 panic"
description: "defer 不贵——大多数时候。Go 1.14 的 open-coded defer 让普通 defer 接近直接调用，统一 benchmark 在 Go 1.25.1/arm64 下测得 3.41ns/0 allocs；循环内 100 个 defer 为 3009ns、1609B、101 allocs，约为直接循环的 13.7 倍。panic/recover 浅层 73.96ns、100 层 953ns；这些数字绑定当前命令和环境，原始输出已保存。"
publishedAt: "2026-08-14"
updatedAt: "2026-08-16"
tags: ["Go", "性能优化", "错误处理"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** defer 的成本取决于位置：**函数尾部的一次性 defer 接近直接调用**（当前基线 3.41ns/0 allocs）；**循环里的 defer 会走慢路径**（100 个 defer 一次函数调用为 3009ns/1609B/101 allocs，约为直接循环的 13.7 倍）；**panic/recover 也不是零成本**——浅调用链 73.96ns、100 层 953ns，而 error 返回约 1.03ns。生产规则仍然是：资源释放可以放心用 defer，但循环里的 defer 要先测；异常路径使用 panic/recover 前要想清楚调用深度和进程语义。


---

![Go defer 三代演进：堆上 defer (30ns) vs 栈上 defer vs 开放编码内联 defer (3ns)](../../../public/images/go-defer-open-coded-heap-panic.svg)

## 一、open-coded defer：为什么函数尾部的 defer 接近直接调用

Go 1.14 引入 open-coded defer：当函数尾部（编译器可证明的返回路径）的 defer 满足条件（数量有限、无循环、可内联）时，不再注册到运行时 defer 链表，而是**直接展开成返回路径上的普通调用**。本机实测（Go 1.25.1，arm64 8 核）：

| 调用方式 | ns/op |
|---|---|
| 直接函数调用 | 约 2.2 |
| `defer`（当前 open-coded 路径） | **3.41** |
| 分配 | 0 |

defer 一个可内联的函数甚至和直接调用同价——这就是为什么"defer 有开销"是过时知识：**函数尾部的 defer 已经是编译期展开的代码，不是运行时注册**。日常代码里 `defer f.Close()`、`defer mu.Unlock()` 的成本可以忽略。

## 二、循环里的 defer：约 13.7 倍税的真实来源

defer 一旦出现在循环体内，编译器无法 open-code（每轮迭代都是独立的动态注册），只能走运行时慢路径 `deferproc`：**每次迭代堆分配一个 `_defer` 结构 + 注册进 goroutine 的 defer 链表**，函数返回时 `deferreturn` 再逐个取出执行。实测（循环 100 次迭代，每次一个 defer）：

| 模式 | 总耗时 | 每轮成本 | allocs |
|---|---|---|---|
| 一次函数调用中注册 100 个 defer | **3009ns** | **30.1ns/个** | **101** |
| 一次函数调用中直接调用 100 次 | **220.2ns** | **2.2ns/个** | 0 |

**约 13.7 倍差距，主要来自运行时 defer 记录和堆分配**。这里的 100 个 defer 会在函数返回时集中执行，所以它不是“每轮单独返回”的真实请求模型；它仍然能证明循环注册 defer 会把 `_defer` 结构和清理成本累加。修复方式是把资源生命周期包在单独函数里，或在确实需要时显式释放。

## 三、panic/recover：74ns 的真相与展开税

panic 的真实成本是两段：**构造与抛出的固定开销 + 栈展开的线性税**。实测：

| 场景 | ns/op |
|---|---|
| panic + recover（1 层调用链） | **73.96** |
| panic + recover（100 层递归） | **953.0** |
| error 返回（当前基线） | **1.025** |

读法：

1. **浅层 panic/recover 仍是几十 ns**：73.96ns 不是毫秒级，但比当前 error 返回基线约 72 倍。异常路径偶尔发生时绝对值不大，热循环里则必须避免。
2. **展开税随深度增长**：100 层 953ns，多出的部分来自逐帧展开；递归/深栈场景用 panic 做控制流，成本与深度相关。
3. **性能不是 panic 的主要风险**：不 recover 的 panic 会打印栈并终止进程；跨 goroutine 的 panic 也不会被另一个 goroutine 的 recover 接住，语义风险比几十 ns 更重要。

另一个 hidden cost：**不 recover 的 panic 会打印全栈**（1M 层递归的栈回溯本身就是 ms 级）且进程退出——panic 的贵不是性能，是它终止进程的语义。



![Panic 抛出与栈展开 (Stack Unwinding) 时序：逐层回放 defer 与 recover 捕获](../../../public/images/panic-recover-stack-unwinding-flow.svg)

## 四、defer 与 panic 的分工：谁该用谁

| 场景 | 选择 | 依据 |
|---|---|---|
| 资源释放、锁解锁（函数尾部） | defer，放心用 | 2~4ns，open-coded 展开 |
| 循环内的清理逻辑 | 移出循环或显式调用 | 当前 100 次基线为 3009ns/101 allocs |
| 异常路径（一次调用链上的失败） | panic/recover 可用 | 当前浅层基线约 74ns，比 error 基线约 72 倍，但绝对值仍小 |
| 深度递归内的失败传播 | 用 error | 展开成本会随调用深度增长；不要把本次 100 层差值外推成固定每层常数 |
| 跨 goroutine 传播错误 | error/通道 | panic 不跨 goroutine 传播 |

一个常被误解的点：**recover 只能在 defer 里生效**（panic 展开时按 defer 链表执行，recover 必须在展开路径上）——这不是性能设计，是语义设计：recover 站在"清理链"上看栈，与 defer 的注册顺序绑定。

## 五、结论：defer 看位置，panic 看展开深度


defer 的性能真相是位置的函数：当前版本的普通 defer 约 3ns，循环注册 100 个 defer 的总成本约 3009ns/101 allocs；panic/recover 是 74ns 起步，100 层约 953ns。选择标准一句话：**defer 看位置，panic 看深度，panic 的进程语义优先于纳秒级优化**。

下一步可做的事：grep 代码里循环体内的 defer（`for` 块内缩进的 `defer`），全部移出；评估你代码里 panic/recover 的使用深度，超过 100 层的改 error。

## 参考资料

1. Go 源码 `runtime/panic.go`（deferproc/deferreturn/gopanic/gorecover）—— Go 1.25.1 本机源码
2. Go 1.14 Release Notes（open-coded defers）—— https://go.dev/doc/go1.14
3. 前作：[Go 锁成本](/writing/go-lock-cost-futex-rwlock)、[goroutine 栈的成长](/writing/go-goroutine-stack-growth)

实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkDefer*`、`BenchmarkPanic*`）；原始输出：`evidence/go-runtime-boundary/2026-08-16-local/raw/closure-defer-panic.txt`。循环 benchmark 的 3009ns 是一次函数中注册 100 个 defer 的总成本，不应误写成任意单个 defer 的固定常数。
