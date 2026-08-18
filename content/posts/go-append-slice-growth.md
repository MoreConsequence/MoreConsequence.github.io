---
title: "append 的扩容税：真实容量序列决定搬运与分配"
description: "append 的成本不是一个固定倍数：Go 1.25.1/arm64 的真实增长 probe 对 100 万个 int 观察到 36 次扩容、最终容量 1,055,744、累计搬运 4,154,012 个元素；同一版本的 65536 个 int benchmark 对比自然增长与预分配的分配账，并解释为什么容量序列、元素大小和 allocator 都要一起看。"
publishedAt: "2026-08-16"
updatedAt: "2026-08-17"
tags: ["Go", "数据结构", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** `append` 的扩容税不是一个可以跨版本复制的固定倍数。Go 1.25.1/arm64 的真实增长 probe 对 100 万个 `int` 观察到 **36 次扩容、最终容量 1,055,744、累计搬运 4,154,012 个元素**，累计搬运约为最终容量的 **3.935 倍**；65536 个 `int` 则是 24 次扩容、约 3.510 倍。统一 benchmark 对 65536 个 `int` 的三次 run 得到：自然增长 **0.30–0.58ms / 26 allocs / 2.51MB**，预分配 **0.067–0.088ms / 1 alloc / 0.52MB**。这些结果绑定 Go 版本、元素类型和停止位置；扩容算法在 256 元素处从翻倍段转入平滑增长，但最终容量还会受到实际 `append` 路径和 allocator 的影响。

## 一、扩容策略：256 元素的分界线

Go 1.18 之后 `growslice` 的容量算法（runtime/slice.go:296）：

```go
const threshold = 256
if oldCap < threshold {
	return doublecap        // <256：直接翻倍
}
for {
	// ≥256：1.25 倍起步，平滑过渡
	newcap += (newcap + 3*threshold) >> 2
	...
}
```

翻倍 vs 1.25 倍的取舍：翻倍省搬家次数（摊薄拷贝），但内存峰值浪费大；平滑增长省内存但搬家更频繁。256 是当前运行时算法的过渡点，而不是所有 Go 版本、元素类型和追加方式的性能分界。源码中的平滑公式是：

```
newcap += (newcap + 3*threshold) >> 2
      ← oldCap < 256 时翻倍 →  ← 之后逐步接近 1.25x →
```

**翻倍在 256 处停止，但后续不是简单的 `oldCap * 1.25`。** 公式会平滑过渡，且最后一次增长要满足新的长度；不同元素大小、追加步长、目标长度和 Go 版本都可能改变实际容量序列。文章中的数字来自真实 `append` probe，而不是手抄一组容量常数。

## 二、真实增长 probe：停止位置会改变累计搬运比例

总搬运量按每次扩容前的旧长度累加。它近似回答“如果元素是固定宽度，运行时需要搬多少元素”，但不包含 allocator 清零、GC、cache 和真实设备行为。仓库 probe 使用真实 `append` 记录容量变化：

| 输入规模 | 最终容量 | 扩容次数 | 累计搬运元素 | 搬运 / 最终容量 |
|---|---|---|---|---|
| 65536 | 69632 | 24 | 244380 | 3.509593 |
| 1000000 | 1055744 | 36 | 4154012 | 3.934677 |

两点要紧：第一，**3.935 倍不是 Go 的常数**，只是这次从零开始、逐个追加到 100 万的快照；改变初始容量或追加模式，比例就会变。第二，累计搬运也不是 B/op：自然增长的 B/op 还包含每次旧数组分配、容量取整和 allocator 行为。可以把它当作解释 benchmark 形状的中间账，而不是性能 SLO。

复现实验：

```bash
cd experiments
go run ./go-runtime-boundary/cmd/slice-growth -limit=1000000
go run ./go-runtime-boundary/cmd/slice-growth -limit=65536
```

当前环境的原始输出保存在 `evidence/go-append-slice-growth/2026-08-17-local/raw/slice-growth.txt`。

## 三、实测：分配字节稳定，墙钟时间要看原始区间

本机实测（Go 1.25.1，arm64 8 核，append 65536 个 int）：

| 方式 | 耗时 | allocs | 分配内存 |
|---|---|---|---|
| 自然增长 `var s []int; append×65536` | **0.30–0.58ms** | 26 | **2.51MB** |
| 预分配 `make([]int, 0, 65536)` | **0.067–0.088ms** | 1 | **0.52MB** |

内存差 2.51/0.52 = **4.8 倍**；它与 65536 输入的累计搬运比例 3.51 倍不是同一个指标，因为 B/op 还包含多个旧数组分配、容量取整和分配器行为。自然增长与预分配的墙钟区间也不能压成一个稳定倍数；可重复的判断是：当前输入下，26 次扩容带来更多分配和搬运，`make` 的容量参数把终点提前告诉运行时。

## 四、生产判断：容量参数怎么给

| 场景 | 判断 | 依据 |
|---|---|---|
| 能估算上界（读文件、读响应） | `make([]T, 0, 估算)` | 当前基线少 25 次分配，分配字节约降到 1/4.8；仍需用目标输入复测 |
| 完全不知道（流式追加） | 自然增长或分块预留 | 先保证语义，再看搬运/内存峰值是否成为瓶颈；不要套用 3.935 或 4.9 倍 |
| 多次 append 同一个切片 | 循环外先 make | 每轮 append 都会扩容，税重复缴纳 |
| 大元素（≥KB 的 struct） | 评估指针、分块或预分配 | 指针减少搬运字节但增加间接访问和 GC 负担，不能默认更快 |
| 切片作为参数传递 | 注意容量别误导 | 见下文：cap 是契约不是建议 |

一个常被误解的细节：`make([]int, 0, 65536)` 与 `make([]int, 65536)` 不同——前者零值初始化 0 个元素、后续 append 不扩容；后者直接给 65536 个零值（更贵的内存清零）。**只 append 不读初始值，用前者**（呼应《[mallocgc 解剖](/writing/go-mallocgc-allocator)》的分配成本：清零是 256B 以上分配的主要成本）。

## 五、结论：可估算上界时预分配，别让 append 替你搬家


append 的扩容税应拆成两层：增长 probe 解释容量序列和累计搬运，benchmark 解释 allocator 带来的 B/op 与 allocs/op。当前 Go 1.25.1/arm64 快照是 100 万元素 36 次扩容、3.935 倍搬运/最终容量，以及 65536 元素自然增长 26 allocs 对预分配 1 alloc；这些数字不是跨版本 SLO。生产规则仍然简单：**能估算上界就预分配；估算不了时先保持自然增长，再用目标 workload 证明是否需要分块或其他结构**。

下一步可做的事：扫一遍你代码里循环内的 `append`（尤其读文件/响应的），凡循环前能算出行数的，加 `make` 预分配并对照 benchmark。

## 参考资料

1. Go 源码 `runtime/slice.go`（nextslicecap、threshold=256、1.25x 公式）—— Go 1.25.1 本机源码
2. Go 官方博客《Appending to a slice》—— https://go.dev/blog/slices-intro
3. 前作：[mallocgc 解剖](/writing/go-mallocgc-allocator)、[benchmark 的七宗罪](/writing/go-benchmark-pitfalls)

实验入口：`experiments/go-runtime-boundary/bench_test.go` 与 `experiments/go-runtime-boundary/cmd/slice-growth/main.go`；原始输出与环境：`evidence/go-runtime-boundary/2026-08-16-local/raw/append.txt`、`evidence/go-append-slice-growth/2026-08-17-local/raw/slice-growth.txt`、对应 `environment.txt`。命令中的 `-benchtime=1s -cpu=8` 和增长 probe 的 `-limit` 必须与表格一起保留。
