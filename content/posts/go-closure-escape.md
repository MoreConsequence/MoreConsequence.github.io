---
title: "闭包捕获的逃逸账：立即执行 0 成本、逃逸 1 alloc 11ns、循环捕获 60ns"
description: "闭包的成本不在语法在逃逸：立即执行的闭包实测 0.32ns/0 allocs（编译器整链内联，等价直接调用）；返回并存储的闭包 11.5ns/16B/1 alloc（捕获变量提升到堆 + 闭包结构，汇编证实闭包调用被折叠成一条 ADD）；循环里构造闭包集合 60.6ns/4 allocs。规则：闭包体的执行成本 = 内联决策，闭包的构造成本 = 逃逸与否。用 -gcflags=-m 看 func literal escapes to heap，热循环里别让闭包逃逸。本机实测 Go 1.25.1。"
publishedAt: "2026-08-16"
updatedAt: "2026-08-16"
tags: ["Go", "逃逸分析", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 闭包贵不贵，取决于它**逃不逃逸**，不取决于语法。本机实测（Go 1.25.1）：① 立即执行且被内联的闭包 **0.32ns/0 allocs**——编译器把闭包调用整链折叠，等价于直接执行（汇编里只剩一条 `ADD`）；② 返回并存储的闭包 **11.5ns/16B/1 alloc**——捕获变量提升到堆 + 闭包结构体分配（`//go:noinline` 后 12.2ns，几乎无差：逃逸时分配已发生）；③ 循环里构造闭包集合 **60.6ns/72B/4 allocs**（循环变量捕获的经典税）。判断规则一句话：**闭包执行成本 = 内联决策，构造成本 = 逃逸与否**。`-gcflags=-m` 里看到 `func literal escapes to heap`，就是分配点。

## 一、逃逸分析怎么对待闭包：捕获变量提升

闭包的本质是"函数 + 环境"。Go 编译器处理三步：

1. **内联决策**：闭包体小且调用点可见 → 整链内联（闭包体直接展开进调用处）；
2. **捕获变量判定**：被闭包引用的局部变量，若闭包**逃逸**（越过函数返回边界存活），变量提升到堆；
3. **闭包对象构造**：`funcval` 结构体（指向闭包体代码的指针 + 捕获变量槽），同样按逃逸决定分配位置。

本实验里最戏剧性的证据：`returningClosure(i)()` 在汇编里被折叠成 `ADD R1, R2, R2`（`s += i`）——**函数调用、闭包结构、捕获变量全部消失**。编译器看穿"闭包创建后立即调用且不存储"，直接当普通调用处理。这是闭包最便宜的形态：和直接写 `s += i` 完全同价。

## 二、实测：三个场景的账

| 场景 | ns/op | B/op | allocs |
|---|---|---|---|
| 立即执行闭包（内联折叠） | 0.32 | 0 | 0 |
| 返回闭包并存储（逃逸） | **11.5** | 16 | **1** |
| 同上 + `//go:noinline` | 12.2 | 16 | 1 |
| 捕获大对象指针的返回闭包 | 15.4 | 16 | 1 |
| 循环构造闭包集合（捕获循环变量） | **60.6** | 72 | **4** |

读法：

1. **0.32 vs 11.5：逃逸是全部差距**。11.5ns 里，1 alloc 覆盖了捕获变量提升 + 闭包对象（16B = funcval + 捕获槽）。
2. **noinline 不加价**：逃逸已经发生，分配已发生，noinline 只是多一次真实函数调用（12.2 vs 11.5ns）——说明逃逸路径上闭包构造已经占了成本大头。
3. **捕获大对象不放大**（15.4ns）：因为捕获的是**指针**（`*big`），不是值。捕获值才会复制 256B——生产上闭包捕获大结构时，编译器要复制逃逸值，那才是分配放大。
4. **循环捕获是税中税**：每次迭代构造闭包（`captureInLoop`：make + 3 个闭包 + 捕获变量，4 allocs）。Go 1.22 起循环变量每迭代独立（每次迭代新变量），正确性修复了，但每次迭代的闭包分配还在——**循环里闭包的分配税与迭代数线性**。

## 三、-m 是闭包税的地图

逃逸分析的可视化（`go build -gcflags='-m=2'`），三个模式对应三种税：

```
./bench_test.go:11:7: func literal escapes to heap in returningClosure:
  from n (captured by a closure)          ← 捕获变量提升
./bench_test.go:11:7: func literal escapes to heap              ← 闭包对象分配
./bench_test.go:30:12: make(...) escapes to heap in captureInLoop:  ← 存储容器分配
```

**每个 `escapes to heap` 都是一个分配点**。闭包场景的排查三步：`-gcflags=-m` 找 `func literal` 行 → 看逃逸源（`from X captured by a closure`）→ 决定能否让闭包不逃逸（立即执行/传参/接收者绑定）。

## 四、生产判断：三个场景三种策略

| 场景 | 策略 | 依据 |
|---|---|---|
| 闭包立即执行（`func(){...}()`、工具函数） | 放心写 | 0.32ns，内联后与直调同价 |
| 闭包存进结构体/传给 API（回调） | 可接受，但别在热循环构造 | 11.5ns/1 alloc 起步 |
| 热循环内构造闭包（`sort.Slice` 回调、go func） | 重构：闭包提出循环外 / 用索引参数 | 60ns/4 allocs，随迭代线性 |
| 捕获大对象 | 捕获指针 | 捕获值 = 每次复制 + 逃逸分配 |

最常见的热循环误用：`go func(){ ... }()` 在循环里发射 goroutine——每次发射 = goroutine 创建（391ns，见《[goroutine 栈](/writing/go-goroutine-stack-growth)》）+ 闭包构造（16B）+ 捕获变量提升。两个税叠加。

## 结论

闭包的成本谜底：**执行永远便宜（内联后 0.32ns），构造看逃逸（11.5ns/1 alloc）**。编译器会尽全力把"立即执行"的闭包折叠成直调；只要闭包跨过返回边界存活，捕获变量和闭包对象就得堆分配。热循环的纪律：闭包提出循环外，捕获变量用参数传入（参数是值拷贝，不进堆）。`-gcflags=-m` 是唯一的地图——看到 `func literal escapes to heap` 就知道钱花在哪了。

下一步可做的事：对你代码里循环内的 `go func`/`sort.Slice` 回调跑 `-gcflags=-m`，把逃逸的闭包提出循环；对照本表估算收益。

## 参考资料

1. Go 源码 `cmd/compile/internal/analysis/escape.go`（逃逸分析）、`runtime/runtime2.go`（funcval）—— Go 1.25.1 本机源码
2. Go 官方博客《Escape analysis in Go》—— https://go.dev/blog/escape-analysis
3. 前作：[goroutine 栈：2KB 起步与 8.2ns/层](/writing/go-goroutine-stack-growth)、[benchmark 的七宗罪](/writing/go-benchmark-pitfalls)