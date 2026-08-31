---
title: "mallocgc 解剖：约 12ns 的小对象、约 85ns 的 256B 分配，与约 733ns 的并发大对象"
description: "Go 的分配成本随对象大小和并发路径分化：仓库内 Go 1.25.1 benchmark 以固定 byte slice 对照 16B/32B/256B/4096B，单线程一次运行分别为 11.93ns、14.09ns、84.77ns、479.4ns；8 P 并发下 256B/4096B 为 89.15ns/732.5ns。数字绑定输入、CPU 和 benchmark，不是 mallocgc 的跨机器常数。"
publishedAt: "2026-08-14"
updatedAt: "2026-08-17"
tags: ["Go", "内存", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** Go 的分配不是“一次 malloc”，是一条按大小分流的流水线：当前 benchmark 用固定 byte slice 对照 16B/32B/256B/4096B，单线程一次输出为 **11.93ns/14.09ns/84.77ns/479.4ns**；8 P 并发下 256B/4096B 为 **89.15ns/732.5ns**。这些数字只属于 Go 1.25.1、Darwin arm64、Apple M1 Pro、`-cpu=8` 和当前 benchmark；它们用来观察 size class、清零和共享路径的方向，不是跨机器常数。复用的动机还要看 GC 压力、生命周期和峰值内存，不是看到一个 `ns/op` 就上池。


---

![Go 内存分配器 TCMalloc 架构：mcache (P 本地无锁) ──► mcentral (跨 P 分级全局) ──► mheap (页堆)](../../../public/images/go-tcmalloc-mcache-mcentral-mheap.svg)

## 一、三层结构：每 P 一份无锁缓存是并发的地基

Go 的分配器是经典的"多级缓存"设计（Go 1.25.1 源码）：

```go
type mcache struct {  // 每个 P 一个，无锁
	alloc [numSpanClasses]*mspan // 按 size class 索引的空闲 span
	tiny       uintptr   // tiny allocator 当前块
	tinyoffset uintptr
	// ...
}

type mcentral struct {  // 每个 size class 一个，全局，有锁
	partial [2]spanSet
	full    [2]spanSet
}

type mheap struct {  // 全局唯一，页级管理
	arenas []*heapArena
	// ...
}
```

分配路径只有一条主线：**mallocgc(size) → 查 size class → mcache 找 span → 有空闲直接切一块（无锁）→ 没有则向 mcentral 借 span（锁）→ mcentral 没有向 mheap 要页（更重的锁 + 可能 syscall）**。绝大多数分配在第一步就完成了——这就是并发的秘密：每个 P 有自己的 `mcache`，两个 goroutine 在不同 P 上分配时根本不会碰到同一把锁。

size class 共 67 档，从 8B 到 32KB（8, 16, 24, 32, 48, 64, 80, ... 每档 8B 起的碎粒度），对象按向上取整落档。落到 32KB 以上的对象跳过 size class，直接向 mheap 申请整页。

## 二、五档实测：成本与大小不是线性

本机实测（Go 1.25.1，Darwin arm64，Apple M1 Pro，`-cpu=8`；单线程表格使用同一 benchmark 的并发参数但每次只有一个 worker）：

| 对象大小 | ns/op | 路径 |
|---|---|---|
| 16B byte slice | **11.93** | 小对象路径 |
| 32B byte slice | 14.09 | mcache size class |
| 256B byte slice | 84.77 | mcache + 清零 |
| 4096B byte slice | **479.4** | 更大的 span/清零路径 |

这组输入显示大小增加会同时提高清零和分配路径成本，但不能仅凭 `ns/op` 断言每个 size class 都必然走同一把锁。尤其是 byte slice 的 benchmark 不能直接证明“两个 int64 一定由 tiny allocator 合并”；要验证 tiny 复用，需要另写对象生命周期和逃逸受控的实验。完整 raw 与限制见 evidence snapshot。

## 三、tiny allocator：16B 以内的小对象为什么只要 12ns

Go 对 ≤16B 的对象有个专门的合并机制（malloc.go:1173）：

```go
if off+size <= maxTinySize && c.tiny != 0 {
	// The object fits into existing tiny block.
	x := unsafe.Pointer(c.tiny + off)
	c.tinyoffset = off + size
	...
	return x, 0
}
```

多个小对象（比如两个 `int64` 字段的结构体、各种小 flag）可能被依次塞进同一个 tiny block，**一次底层分配服务多个对象**。好处不只是省分配次数：这些对象在内存里彼此相邻，GC 扫描和 cache 局部性可能更好。代价是它们共享同一块内存的分配周期——tiny 块里任何一个对象活着，整块都活着，所以对象生命周期差异大会放大驻留。本文的 byte-slice benchmark 没有单独证明某个结构体一定走 tiny 合并；要量化驻留放大，必须另写对象生命周期和逃逸受控的实验。



![Tiny 分配器微小对象合并打包：16 字节块内 offset 位移与 0 碎片](../../../public/images/tiny-allocator-sub-16-byte-packing.svg)

## 四、并发画像：无锁的小对象 vs 上锁的大对象

多线程并发分配（同一进程，ns/op）：

| 并发 worker | 256B 对象 | 4096B 对象 |
|---|---|---|
| 1 | 84.77 | 479.4 |
| 8 | **89.15** | **732.5** |

并发 benchmark 只比较 1 worker 与 8 worker，不能外推“几百线程也不涨”。256B 从 84.77ns 到 89.15ns，4096B 从 479.4ns 到 732.5ns；这是当前机器和 `RunParallel` 输入下的观察。大对象增幅更明显，但具体归因仍要结合 runtime 源码、分配大小、GC 与 profile，不能只凭两行数字断言某个全局锁是唯一原因。

## 五、生产判断：分配便宜，但复用不是因为分配贵

| 场景 | 选择 | 依据 |
|---|---|---|
| 热路径小对象（≤256B） | 直接分配作为基线 | 当前输入约 12–85ns；先看 GC 与生命周期 |
| 热路径大对象（≥4KB） | 比较复用/预分配 | 当前输入 479.4ns，8 worker 为 732.5ns |
| 并发大对象 | 先做同语义 `RunParallel`/服务压测 | 当前样本显示增幅，但不能直接归因单一锁 |
| 生命周期短的小对象群 | 直接分配作为基线 | 先用 escape analysis 和 profile 证明池有收益 |
| 生命周期长的缓存 | sync.Pool | 见本系列《sync.Pool》篇 |

一个反复出现的误判是“分配贵，所以我要写对象池”。当前 256B/4096B benchmark 只是候选信号；是否池化要同时测 `allocs/op`、GC pause、峰值 HeapAlloc、对象复用率和竞争。对象池可能降低分配压力，也可能延长对象生命周期、增加清理复杂度或把内存峰值推高。没有同语义 pool 对照和业务 profile，不能从单一 `ns/op` 得出生产选择。

## 六、结论：分配器优化的关键是 size class 与局部性

Go 的分配成本至少受对象大小、清零、逃逸、GC 和并发路径共同影响：当前 byte-slice benchmark 在 16B/32B/256B/4096B 上得到 11.93/14.09/84.77/479.4ns，8 worker 的 256B/4096B 为 89.15/732.5ns。三层结构（mcache/mcentral/mheap）解释了为什么需要看 size class 与 P 局部性，但数字不能替代 profile。生产判断应是：**先用直接分配建立基线，再用同语义复用实验和 GC/峰值指标决定是否池化**。

下一步可做的事：运行仓库 benchmark，再在目标服务上用 `pprof alloc_space` 找候选分配点；对每个候选同时记录 GC、峰值 HeapAlloc、`allocs/op` 和竞争，确认预分配 buffer 或池真的改善了业务指标。原始 benchmark 与环境记录在 `evidence/go-mallocgc-allocator/2026-08-17-local/`。

## 参考资料

1. Go 源码 `runtime/mcache.go`、`runtime/mcentral.go`、`runtime/mheap.go`、`runtime/malloc.go`（tiny allocator malloc.go:1173）—— Go 1.25.1 本机源码
2. Go 官方文档《runtime/mem》与《Go 内存模型》—— https://go.dev/doc/faq
3. 前作：[Go GC 时间账本](/writing/go-gc-gctrace-account)、[string ↔ []byte：零拷贝的边界](/writing/go-string-byte-conversion)
