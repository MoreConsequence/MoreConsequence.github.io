---
title: "mallocgc 解剖：12ns 的 tiny 合并、80ns 的无锁并发，与 742ns 的大对象"
description: "Go 的分配成本按大小分三档：≤16B 走 tiny allocator（实测 12.6ns，多个小对象合并进一个块）、≤32KB 走 size class 的 P 本地缓存（13.5ns 起步）、大对象走全局堆（4KB 实测 494ns）。并发行为分化明显：256B 小对象 8 线程仍 82ns（mcache 无锁，零恶化），4KB 大对象从 546 涨到 742ns（mcentral 全局锁）。本机实测 Go 1.25.1。"
publishedAt: "2026-08-14"
updatedAt: "2026-08-14"
tags: ["Go", "内存", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** Go 的分配不是"一次 malloc"，是一条按大小分流的三层流水线：≤16B 的微小对象被 **tiny allocator 合并**到 16B 块里共享（实测 12.6ns/次）；16B~32KB 按 **67 个 size class** 从 P 本地缓存 `mcache` 无锁取 span（32B 13.5ns）；更大的对象逐级向 `mcentral`（全局锁）和 `mheap`（页管理）申请，4KB 实测 493.8ns。并发画像最关键：**小对象分配几乎不随线程数恶化**（8 线程 82ns vs 单线程 90ns，mcache 每 P 一份、无共享锁），**大对象分配从 546ns 涨到 742ns**（mcentral 竞争）。结论：分配本身很便宜（12~90ns），真正贵的是大对象和 GC 压力——复用的动机是后者不是前者。

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

本机实测（Go 1.25.1，arm64 8 核，单线程，防死代码消除）：

| 对象大小 | ns/op | 路径 |
|---|---|---|
| 16B（两个 int64） | **12.6** | tiny allocator 合并 |
| 32B | 13.5 | mcache size class |
| 256B | 89.0 | mcache + 清零 |
| 4096B | **493.8** | mcentral/mheap |

三个层次清晰可见：**16~32B 都在 ~13ns**（tiny 合并与最小 span 成本几乎相同）；256B 跳升到 89ns（对象大，清零 + span 内查找成本上升）；4KB 到 494ns（要越级向全局结构借 span，且 4KB 清零本身就是 1µs 级的 memclr 的一半）。注意 256B 与 4KB 之间还有一层隐形差异：**4KB 对象每次分配都会触发向 mcentral 的借用或归还，128B 以内的对象几乎永远命中 mcache 本地**。

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

多个小对象（比如两个 `int64` 字段的结构体、各种小 flag）被依次塞进同一个 16B 块，**一次底层分配服务多个对象**。好处不只是省分配次数：这些对象在内存里彼此相邻，GC 扫描、cache 局部性都更好。代价是它们共享同一块内存的分配周期——tiny 块里任何一个对象活着，整块都活着，所以 tiny 块内的对象生命周期差异大会放大驻留。这是"合并"买速度、卖空间的经典交易：**12.6ns 的背后是潜在的 16 倍驻留放大**（16B 块里可能只有一个 1B 对象活着）。

## 四、并发画像：无锁的小对象 vs 上锁的大对象

多线程并发分配（同一进程，ns/op）：

| 线程数 | 256B 对象 | 4096B 对象 |
|---|---|---|
| 1 | 89.6 | 546.2 |
| 4 | 77.3 | 673.3 |
| 8 | **82.3** | **742.2** |

小对象 8 线程反而与单线程持平（82 vs 90，波动内）——**每个 P 的 mcache 互不干扰，理论上线程数可以涨到几百而分配成本不涨**。大对象从 546 涨到 742（+36%）：4KB 对象借还 span 的路径要经过 mcentral 的全局锁，线程越多锁排队越明显。这是 Go 分配器最值得记住的一张图：**把大对象从热路径上移走，比优化分配本身更有效**——热路径用小对象（≤256B），大对象用池/预分配/复用。

## 五、生产判断：分配便宜，但复用不是因为分配贵

| 场景 | 选择 | 依据 |
|---|---|---|
| 热路径小对象（≤256B） | 直接分配 | 13~90ns，无锁并发，省心 |
| 热路径大对象（≥4KB） | 复用（预分配 buffer） | 494ns+，且并发下涨到 742ns |
| 高并发（≥8 线程）大对象 | 每 P 一份的缓冲 | 避开 mcentral 全局锁 |
| 生命周期短的小对象群 | 直接分配 + tiny 合并 | 12.6ns 比任何池都便宜 |
| 生命周期长的缓存 | sync.Pool | 见本系列《sync.Pool》篇 |

一个反复出现的误判："分配贵，所以我要写对象池"。实测 256B 分配是 89ns——**对象池的 Get/Put 本身就要 20~300ns 且有竞争风险**（见本系列 sync.Pool 篇的实测），池只在两种情况下赢：对象 ≥4KB（分配 494ns+），或分配频率高到 GC 压力失控。大部分时候，Go 的分配器已经够快，你的池只是在帮分配器省钱——而它不缺钱，缺的是大对象和 GC 的账。

## 结论：分配器优化的关键是 size class 与局部性

Go 的分配成本按大小分三档：tiny 合并 12.6ns、size class 本地 13.5~90ns、越级大对象 494ns+。并发行为同样分档：小对象无锁（8 线程零恶化）、大对象有锁（+36%）。三层结构（mcache/mcentral/mheap）和每 P 一份的设计是这套性能的全部秘密。生产判断一句话：**小对象随便分，大对象必须复用，竞争热点别上锁**。

下一步可做的事：把你代码里 ≥4KB 的临时分配点找出来（pprof alloc_space），改成预分配 buffer 或池；确认热路径上没有大对象直接分配。

## 参考资料

1. Go 源码 `runtime/mcache.go`、`runtime/mcentral.go`、`runtime/mheap.go`、`runtime/malloc.go`（tiny allocator malloc.go:1173）—— Go 1.25.1 本机源码
2. Go 官方文档《runtime/mem》与《Go 内存模型》—— https://go.dev/doc/faq
3. 前作：[Go GC 时间账本](/writing/go-gc-gctrace-account)、[string ↔ []byte：零拷贝的边界](/writing/go-string-byte-conversion)
