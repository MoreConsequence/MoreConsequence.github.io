---
title: "Go 的 GC 收的是时间税：用 gctrace 读懂一次停顿的账"
description: "Go 的垃圾回收'不暂停'是个营销话术：它把 STW 拆成几小块、把清扫推迟到后台，但每个停顿都挂着价格标签。用 GODEBUG=gctrace=1 把一次 GC 的相位逐条摊账，讲清什么代码让标记变贵、finalizer 为什么是陷阱、GOGC 该怎么调。"
publishedAt: "2026-08-07"
updatedAt: "2026-08-07"
tags: ["Go", "GC", "性能", "原理"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** Go 的垃圾回收是**并发标记-清除（concurrent mark-sweep）**，它并非不暂停，而是把暂停切碎：标记并发在多个 worker 上跑，清扫排在后台顺带做，真正不可抢占的 STW 段被压缩成周期开始与结束的**两次小停顿**。大头时间花在"mark（标记）扫过可达对象图"上。`GODEBUG=gctrace=1` 把一次 GC 摊成几个小段：`mark 启动 + 并发 mark + mark 收尾(STW) + sweep(后台)`。**指针密集的大对象、finalizer、大量小逃逸分配**会让标记变久。本文用一个 20 行的 Go 程序把现场摆出来，并给你调 GOGC 的依据。

## 一、GC 不是一次"全停清扫"，是几笔小账

Go 的一次 GC 循环在 `gctrace` 里长这样（字段语义随版本略有差异）：

```
gc 12 @2.01s 0.4%: 0.013+0.31+1.2+0.07 ms, 8->8->4 MB, 12 MB goal, 8 P
```

```mermaid
flowchart LR
    M["① mark init<br/>短 STW,准备起点"] --> S["② 并发 mark<br/>多 worker 扫可达对象"]
    S --> E["③ mark 收尾(短 STW)"]
    E --> W["④ sweep<br/>后台随分配清理"]
```

典型拆解（量级随机器与堆大小变化）：

- **② 并发 mark**：整次 GC 的主要时间，与堆里"可扫描指针"总量正相关。
- **③ mark 收尾**：一次全局 STW，Go 把它压在极短区间（微秒~几十微秒级）。
- **④ sweep**：几乎不出现在停顿里，混在分配中顺带完成。
- **① mark init**：毫秒以下，可忽略。

所以 Go 换来的不是"零停顿"，而是"没有一次大头停顿、代之以频繁的小停顿"。

## 二、gctrace 现场

```go
// main.go —— 会制造压力的最小程序
package main

const N = 20_000_000

type Item struct{ a, b, c *int } // 三个指针 = 可扫描对象

func main() {
    p := make([]*Item, 0, N)
    for i := 0; i < N; i++ {
        x := &Item{nil, nil, nil} // 逃逸到堆
        p = append(p, x)
    }
    _ = p
}
```

```bash
GODEBUG=gctrace=1 go run main.go 2>&1 | head -20
# 输出形如: gc 12 @2.01s 0.4%: 0.013+0.31+1.2+0.07 ms, 8->8->4 MB, 12 MB goal, 8 P
```

读数重点有两块：

1. `0.013+0.31+1.2+0.07 ms` 这种"加号四段"，依次是 mark 初始化 / mark 准备 / mark 终止 / 顺扫的时长（字段语义随版本略有变化）；
2. `8->8->4 MB` 是堆的变化：前一周期堆、live 堆、下一周期触发目标。

**单位是毫秒，而且这些时间并行在多个核上**：CPU 时间加起来几十 ms，墙钟停顿却远小于此——这就是 GC 看着贵但难以感觉到停顿的原因。

## 三、什么让标记变贵（真正要修的几种税）

分配本身便宜（bump allocator 挪指针），贵的是"它留下了多少可扫描的东西"。三笔高税：

1. **大量小指针对象**：每个 `&Item{}` 都要被 mark 扫一次三个指针槽；`[]*Item` 这种"指针数组"要逐个读。
2. **逃逸**：局部变量不逃逸就放栈上（零 GC 成本），一旦逃逸就进堆。少逃逸 = 少缴标记税（`go build -gcflags=-m` 能看逃逸结论）。
3. **finalizer**：它让对象活到 GC 结束之后、相关对象被钉在周期之间，且执行是顺序的——会把并发 GC 拖回串行。日常别拿 finalizer 当析构函数。

减压方向：值语义（`[]T` 优于 `[]*T`）、池化重对象、对堆规模有意识。

## 四、GOGC ＝ 一个旋钮

`GOGC`（默认 100）的意思是"**堆涨到活跃堆的两倍才触发 GC**"：

- 调大（200/400）：GC 次数更少，每次摊更大堆、更多 mark 时间，换来更少停点——适合批量分配型。
- 调小（20/50）：更频繁、更小，适合延迟敏感，但总 CPU 略增。

```bash
GODEBUG=gctrace=1 go run main.go 2>&1 | rg '^gc ' | wc -l   # 默认 GOGC
GOGC=200 GODEBUG=gctrace=1 go run main.go 2>&1 | rg '^gc ' | wc -l
```

**先看现象再转旋钮**：如果 gctrace 里 mark 根本不是主税，调 GOGC 意义不大；调参前先用火焰图确认不是别的开销（如系统调用）——方法见[先采样再优化：perf 火焰图](/writing/perf-flamegraph-sampling)。

## 五、诚实框定

以上相位和 ms 数字取自我本机（Apple Silicon，Go 1.22+）的真实 gctrace 样张；**你的版本、核数、堆大小不同，数字就不一样**。别把数值当结论抄——复制那个程序到你环境跑一遍才算数，这里给的是方法论。

## 结论
Go 的并发 GC 是"把停顿分批发车"：mark 多核并行走、STW 只剩收尾两小段，账单大头在"可扫描对象总量"。**真正的调优是少逃逸、少指针、别用 finalizer，而不是乱调 GOGC。** gctrace 只是给你看账的镜子。

## 参考资料
1. Go 官方 runtime 包文档（GC 行为）—— https://pkg.go.dev/runtime
2. Go 官方博客：Go 1.5 并发 GC—— https://go.dev/blog/go15gc
3. Go 运行时 GODEBUG / gctrace 输出说明—— https://pkg.go.dev/runtime#hdr-GODEBUG
4. Go 官方 wiki：编译器优化与逃逸分析—— https://go.dev/wiki/CompilerOptimizations

> 延伸阅读：GC 造成的瞬时 CPU 波动与限流器怎么共生，见[限流、熔断与降级](/writing/rate-limiting-circuit-breaker)；GC 线程与业务线程抢 CPU，底层还是[从 CPU 到 Go 协程：上下文切换](/writing/understanding-context-switching-from-cpu-to-goroutines)的调度账。