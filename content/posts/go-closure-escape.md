---
title: "闭包捕获的逃逸账：立即执行 0 alloc、逃逸 1 alloc 12ns、循环集合 52ns"
description: "闭包的成本不在语法而在逃逸：统一 benchmark 在 Go 1.25.1/arm64 下测得立即执行闭包 0.67ns/0 allocs，存入全局后再调用 12.47ns/16B/1 alloc，循环构造 4 个闭包为 52.39ns/64B/4 allocs。规则是：闭包体成本取决于内联，闭包构造成本取决于生命周期；用 -gcflags=-m 查 func literal escapes to heap。"
publishedAt: "2026-08-16"
updatedAt: "2026-08-16"
tags: ["Go", "逃逸分析", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 闭包贵不贵，取决于它**逃不逃逸**，不取决于语法。统一 benchmark（Go 1.25.1/arm64）测得：立即执行且可内联的闭包 **0.67ns/0 allocs**；存入全局后再调用 **12.47ns/16B/1 alloc**；循环里构造 4 个闭包 **52.39ns/64B/4 allocs**。第一条路径里闭包可能被编译器折叠，第二条路径必须保存函数值和捕获环境，第三条路径则把构造税按迭代数放大。判断规则一句话：**闭包执行成本 = 内联决策，构造成本 = 逃逸与否**。`-gcflags=-m` 里看到 `func literal escapes to heap`，就是分配点。

## 一、逃逸分析怎么对待闭包：捕获变量提升

闭包的本质是"函数 + 环境"。Go 编译器处理三步：

1. **内联决策**：闭包体小且调用点可见 → 整链内联（闭包体直接展开进调用处）；
2. **捕获变量判定**：被闭包引用的局部变量，若闭包**逃逸**（越过函数返回边界存活），变量提升到堆；
3. **闭包对象构造**：`funcval` 结构体（指向闭包体代码的指针 + 捕获变量槽），同样按逃逸决定分配位置。

如果把一个闭包创建后立即调用且不存储，编译器可能把它折叠成与直接调用相同的指令；要把这件事写成结论，必须在目标版本用 `go tool compile -S` 或 `go build -gcflags=-S` 检查，而不能从一次 ns/op 反推汇编。当前入口用 `BenchmarkClosureImmediate` 测量这种低成本形态，用 `BenchmarkClosureEscaping` 通过全局存储强制保留函数值。

## 二、实测：三个场景的账

| 场景 | ns/op | B/op | allocs |
|---|---|---|---|
| 立即执行闭包（内联折叠） | **0.67** | 0 | 0 |
| 存入全局后再调用（逃逸） | **12.47** | 16 | **1** |
| 循环构造 4 个闭包 | **52.39** | 64 | **4** |

读法（固定 `-benchtime=1s -cpu=8` 的一次运行）：

1. **0.67 vs 12.47：生命周期是主要差距**。12.47ns 里包含 1 次函数值/捕获环境分配（16B）；如果闭包没有跨出调用点，编译器可以把它消掉。
2. **当前入口没有把 `noinline` 单独当作结论**：内联与逃逸是两个维度，不能只看到一个 benchmark 就断言所有闭包调用都会被折叠。
3. **循环捕获是税中税**：每次迭代构造闭包，分配次数与迭代数线性增长。Go 1.22 起循环变量绑定语义修复了经典错误，但正确性修复没有消除闭包对象的分配。

## 三、-m 是闭包税的地图

逃逸分析的可视化（`go build -gcflags='-m=2'`），三个模式对应三种税：

```
./bench_test.go:...: func literal escapes to heap in makeClosure:
  from value (captured by a closure)      ← 捕获变量提升
./bench_test.go:...: func literal escapes to heap              ← 闭包对象分配
./bench_test.go:...: make(...) escapes to heap in BenchmarkClosureLoopCollection:  ← 存储容器分配
```

**每个 `escapes to heap` 都是一个分配点**。闭包场景的排查三步：`-gcflags=-m` 找 `func literal` 行 → 看逃逸源（`from X captured by a closure`）→ 决定能否让闭包不逃逸（立即执行/传参/接收者绑定）。

## 四、生产判断：三个场景三种策略

| 场景 | 策略 | 依据 |
|---|---|---|
| 闭包立即执行（`func(){...}()`、工具函数） | 放心写，但以目标版本检查 | 0.67ns，0 allocs 的本机基线 |
| 闭包存进结构体/传给 API（回调） | 可接受，但别在热循环构造 | 12.47ns/1 alloc 起步 |
| 热循环内构造闭包（`sort.Slice` 回调、go func） | 重构：闭包提出循环外 / 用索引参数 | 52.39ns/4 allocs，随迭代线性 |
| 捕获大对象 | 捕获指针 | 捕获值 = 每次复制 + 逃逸分配 |

最常见的热循环误用：`go func(){ ... }()` 在循环里发射 goroutine——每次发射 = goroutine 创建（391ns，见《[goroutine 栈](/writing/go-goroutine-stack-growth)》）+ 闭包构造（16B）+ 捕获变量提升。两个税叠加。

## 五、结论：闭包便宜与否取决于是否跨边界逃逸


闭包的成本谜底：**立即执行路径可以低到 1ns 以下，跨生命周期保存则约 12ns/1 alloc，循环构造会按迭代数累积**。编译器会尽力把可见的立即调用折叠成直调；只要闭包跨过当前调用边界存活，捕获变量和闭包对象就可能堆分配。热循环的纪律：闭包提出循环外，或把捕获状态显式作为参数传入。`-gcflags=-m` 是地图，但最终仍要用目标 workload 的 benchmark 验证。

下一步可做的事：对你代码里循环内的 `go func`/`sort.Slice` 回调跑 `-gcflags=-m`，把逃逸的闭包提出循环；对照本表估算收益。

## 参考资料

1. Go 源码 `cmd/compile/internal/analysis/escape.go`（逃逸分析）、`runtime/runtime2.go`（funcval）—— Go 1.25.1 本机源码
2. Go 官方博客《Escape analysis in Go》—— https://go.dev/blog/escape-analysis
3. 前作：[goroutine 栈：2KB 起步与 8.2ns/层](/writing/go-goroutine-stack-growth)、[benchmark 的七宗罪](/writing/go-benchmark-pitfalls)

实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkClosure*`）；原始输出：`evidence/go-runtime-boundary/2026-08-16-local/raw/closure-defer-panic.txt`。
