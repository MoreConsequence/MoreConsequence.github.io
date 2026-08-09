---
title: "Go 内存泄漏不是玄学：pprof 的堆账与三个误报"
description: "泄漏定位靠的是同一进程两个时刻的对照：用 1MB 采样级别的 heap profile 实测两种泄漏（全局 slice 吸水、goroutine 累积），再拆三个常见误报：RSS 高≠泄漏、alloc_space 狂涨≠泄漏、goroutine 泄漏不出现在堆上。"
publishedAt: "2026-08-10"
updatedAt: "2026-08-10"
tags: ["Go", "pprof", "内存泄漏", "调试"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 内存泄漏的证明方法只有一个：**同一进程两个时刻堆的差**。`go tool pprof` 默认看 `inuse_space`，但它有三处会骗人：**采样只取 1MB 以上的大块**（小对象漏检，得换 `inuse_objects`）、**`Sys` 涨不等于 `Alloc` 涨**（Go 不把堆还给 OS，RSS 高≠泄漏）、**goroutine 是隐形大户**（每个卡死的 G 挂着 2KB 起步的栈和引用对象，堆曲线却纹丝不动）。三大误报：RSS 高（空闲缓冲池占着）→ 看 `sys`；alloc_space 狂增（分配风暴）≠ 泄漏；goroutine 数翻番（真泄漏第一大户）→ 看 `goroutine` profile。正确姿势：先看总账再动刀，用 `-base` 对拍两帧。

## 一、直觉错在哪：RSS 涨 ≠ 泄漏，泄漏 ≠ 内存涨

两个方向的误判都常见：

1. **看 RSS 说泄漏**：进程驻留 6GB，却不一定漏——Go 的内存在 GC 后不立即归还 OS，堆里空闲页继续占 RSS 等待复用（详见[Go GC 时间账本](/writing/go-gc-gctrace-account)）。
2. **看 inuse_space 平稳说不漏**：但 goroutine 数 1000→100000，每个卡住的 goroutine 都有自己的栈和引用对象，堆曲线可以是平的——**goroutine 泄漏是最常见的内存泄漏形式，且第一时间不在 heap 上**。

先分清三本账：

- **RSS（`Sys`）**：进程从 OS 拿的物理页——受 Go 内存池策略影响，上涨≠泄漏。
- **HeapAlloc（`Alloc`）**：堆里共有多少字节"活着"——**真正判断泄漏的量**。
- **HeapObjects**：存活对象数；对象数越来越多而字节数不动=碎片/小对象爆发。

## 二、实验：泄漏的签名长什么样

写一个两处泄漏的 demo 跑起来（全局 slice 吸水 + 每毫秒新开一个卡死的 goroutine），两帧采样：

```go
package main

import (
	"net/http"
	_ "net/http/pprof"
	"time"
)

var store [][]byte

// 泄漏一：全局 store 只增不减（每 2ms 追加 1MB）
func growHeap() {
	for {
		store = append(store, make([]byte, 1<<20))
		time.Sleep(2 * time.Millisecond)
	}
}

// 泄漏二：每 1ms 新起一个 goroutine，全部卡在永不发送的 channel 上
func spawnStuckGoroutines() {
	for {
		ch := make(chan struct{})
		go func() { <-ch }()
		time.Sleep(time.Millisecond)
	}
}

func main() {
	go growHeap()
	go spawnStuckGoroutines()
	http.ListenAndServe(":6060", nil)
}
```

间隔 10 秒拉两帧（需要 pprof 已在程序里 import）：

```bash
curl -s localhost:6060/debug/pprof/heap > /tmp/heap.1.prof
sleep 10
curl -s localhost:6060/debug/pprof/heap > /tmp/heap.2.prof
```

本机实测两帧（M1 Pro、macOS、Go 1.25）：

```text
帧 1：heap profile: 245: 249569584   goroutine profile: total 1680
帧 2：heap profile: 1912: 1987063792 goroutine profile: total 9929
```

**10 秒内堆 0.25GB→1.99GB，goroutine 1680→9929——这是两个泄漏的签名**。谁在吃内存？`go tool pprof -inuse_space`：

```text
Showing nodes accounting for 2.12GB, 99.70% of 2.12GB total
     flat  flat%   sum%        cum   cum%
   2.12GB 99.70% 99.70%     2.12GB 99.70%  main.growHeap
```

## 三、变量视角：heap 采样有倾斜，别用 inuse_space 定案

`pprof` 默认 `-sample_index=inuse_space`，而 heap profile 只有**每分配 1MB 才采一次样**（头部 `@ heap/1048576`）。这决定了三个陷阱：

1. **对象小**：小对象泄漏（几百字节的对象每次 1KB）在采样里几乎不出现——换 `-sample_index=inuse_objects` 或调 `MemProfileRate`（只在本地复现时 `debug.SetMemoryProfileRate(1)`，别上生产）。
2. **alloc_space 狂涨**：分配风暴（高频小分配）≠ 泄漏。`TotalAlloc` 冲天但 inuse 平稳，是 GC 在兜底——查 alloc 热点而不是找 leak。
3. **只看 inuse_space**：goroutine 栈虽在堆空间里统计，但归因到 runtime 而不是业务函数——想确认 G 层泄漏得看 goroutine profile。

正确的"泄漏工作流"是**对拍两帧**，而不是单帧定案：

```bash
go tool pprof -inuse_space -base /tmp/heap.1.prof /tmp/heap.2.prof
# 输出 delta：growHeap 这条净增 ~1.7GB，其余节点全部归零
```

`-base` 把两帧里相同的内存热度减掉，只剩**净增长**，才是泄漏的账。

## 四、三大误报：什么时候"内存涨"不是泄漏

| 现象 | 误认为 | 真因 | 怎么验证 |
| --- | --- | --- | --- |
| inuse 不高但 RSS 涨 | 泄漏 | GC 后空闲堆不归还去 OS | 看 `Alloc` 与 `Sys` 的差 |
| TotalAlloc 每秒狂涨 | 泄漏 | 大量临时分配（GC 在兜底） | inuse 差平稳→非泄漏，查 alloc 热点 |
| goroutine 数暴涨 | 内存泄漏 | goroutine 泄漏（最常见形式） | `/debug/pprof/goroutine` 两帧 diff |

实操细节：**RSS 高 ≠ 泄漏，Alloc 高且稳定才是**。Go 诊断顺序：

```text
1. /debug/pprof/goroutine?debug=1 两次：goroutine 数不涨 → 排除 G 泄漏
2. heap 两帧 -base：inuse 差大 → 堆泄漏；差小 → 分配风暴
3. 看 MemStats：Alloc 涨而 HeapSys 不动 → 泄漏落锤
```

demo 的 goroutine 数 10 秒从 1680 涨到 9929——G 层在漏；堆采样里 growHeap 占了 99.7%，说明对象层也在漏——两本账都验了。

## 五、排查的快速流程（从快到慢四步）

开挖顺序建议用"快→慢"：

1. **先看 RSS**：突然爆但 heap 没爆 → 空闲列表、缓冲池问题，见上文误报一。
2. **再看 goroutine**（一次 curl 的事）：`goroutine?debug=1` diff 数，找"只多不少"的入口。
3. **heap 两帧 -base**：定位 inuse 增量函数。
4. **临时降采样阈值**：本地 `debug.SetMemoryProfileRate(1)` 复现小对象（代价是 profile 文件变大、CPU 上涨）。

生产禁止"看一次 profile 就下结论"：要有**监控-基线-双帧**配置。在监控里挂 HeapAlloc 曲线（如 Prometheus `go_memstats_alloc_bytes`），阈值告警后，拉两帧 pprof 互为基线，diff 定位——有基线才有发言权。

## 结论

内存泄漏的判定不靠"内存涨"也不靠"inuse 高"，靠的是**两个时刻的差 + 三张账（Alloc/goroutine/Sys）对着看**。pprof 的两帧对比（`-base`）能帮你把"系统性增长"和"配置/缓存/临时分配"分开：前者才叫泄漏，后者是另一类账。

动手顺序（本机、10 分钟）：

```bash
cd leakdemo
curl -s localhost:6060/debug/pprof/heap > /tmp/h1.prof && sleep 10
curl -s localhost:6060/debug/pprof/heap > /tmp/h2.prof
go tool pprof -inuse_space -base /tmp/h1.prof /tmp/h2.prof   # 交互输入 top15
```

## 参考资料

1. Go 官方 pprof 文档（采样与四种视图）—— https://pkg.go.dev/runtime/pprof
2. `runtime.MemStats` 字段解释（Alloc/Sys/Heap* 的账目）—— https://pkg.go.dev/runtime#MemStats
3. Go 官方调试指南（含 pprof 一节）—— https://go.dev/doc/diagnostics

> 前作见：[Go GC 时间账本](/writing/go-gc-gctrace-account)、[Go 调度器的三张表](/writing/go-scheduler-gmp-preemption)、[先采样再优化：perf 火焰图](/writing/perf-flamegraph-sampling)。