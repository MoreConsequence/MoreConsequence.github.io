---
title: "time.After 的隐藏账单：热循环里的 GC 压力与 0 分配的修复"
description: "time.After 每次调用 248B/3 次分配——热循环里 6 秒分配 7.2GB、触发 2024 次 GC（每 3ms 一轮）。本机三档实测：After vs NewTimer+Stop vs NewTimer+Reset，后者 0 allocs、GC 归零、吞吐反超 67%。本文讲清账单构成、为什么 Stop 救不了分配，以及三种模式的生产适用边界。"
publishedAt: "2026-08-11"
updatedAt: "2026-08-11"
tags: ["Go", "性能优化", "GC"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** `time.After` 每次调用都走 `NewTimer(d).C`（time/sleep.go:202），产生 248B/3 次分配，并往 per-P 定时器堆里挂一个 timer。热循环里这么写，账单不是内存滞留而是 **GC 频率**：本机实测（Go 1.25.1）6 秒热循环分配 7.2GB、触发 2024 次 GC（约每 3ms 一轮）；改成 `NewTimer` + 每轮 `Reset` 复用，**0 allocs、GC 归零、同样 6 秒吞吐反超 67%**。特别注意：`NewTimer` + `Stop` 并不能省分配——分配量一模一样，它只是免滞留。生产判断一句话：低频一次性（请求级）用 `After` 没问题，高频循环必须复用 timer。

## 一、先看真相：time.After 不是定时器，是定时器的构造函数

很多人把 `time.After(d)` 当作"免费的等待"——和 `time.Sleep` 并列。源码里它是这样的（Go 1.25.1）：

```go
// time/sleep.go
func After(d Duration) <-chan Time {
	return NewTimer(d).C
}
```

也就是说每次调用 `time.After(5*time.Second)`，实际发生三件事：

1. 分配一个 buffered channel（`make(chan Time, 1)`，NewTimer 内部）；
2. 分配一个 runtime timer 对象，插入当前 P 的定时器堆（per-P `timers.heap`，按 `when` 排序）；
3. 分配 `time.Timer` 包装结构返回 channel。

用 `testing.B` 实测单次成本（本机 Go 1.25.1）：

```
BenchmarkAfterHour           136.9 ns/op   248 B/op   3 allocs/op
```

248B/3 次分配——这个数字本身看着不大。但注意一件事：**`time.After` 没有配套的 `Stop` 入口**。你拿到的是 channel，不是 `*Timer`。每个 timer 只能在堆里待到自然到期（然后 `sendTime` 尝试发送，channel 无人接收就发个寂寞）或被 runtime 惰性清理。这是它和 `NewTimer` 在 API 上最本质的差别。

## 二、三档实测：账单到底记在哪个账户

写一个非阻塞热循环（典型的生产反例：轮询/自旋逻辑里每轮都建新超时）：

```go
// 模式 A：time.After 每轮新建（反例）
for {
    select {
    case <-stop:
        return
    case <-time.After(5 * time.Second):  // 每轮 248B/3 allocs，从没人等到它
    default:
    }
    iterations++
}

// 模式 C：循环外建 timer，每轮 Reset 复用（修复）
t := time.NewTimer(5 * time.Second)
defer t.Stop()
for {
    select {
    case <-stop:
        return
    case <-t.C:
    default:
    }
    t.Reset(5 * time.Second)
    iterations++
}
```

模式 B（`NewTimer` + `Stop` 每轮新建）也一并测。6 秒运行，`runtime.MemStats` 每轮采样：

| 模式 | 迭代数 | 速率 | totalAlloc | GC 次数 | GC 周期 |
|---|---|---|---|---|---|
| A. `time.After` 每轮新建 | 30.5M | 5.1M/s | **7.2GB** | **2024** | 约 3ms |
| B. `NewTimer`+`Stop` 每轮新建 | 27.7M | 4.6M/s | 6.6GB | 1841 | 约 3ms |
| C. `NewTimer`+`Reset` 复用 | **51.1M** | **8.5M/s** | **1.3MB** | **0** | — |

三个结论，每一个都反直觉：

1. **账单不在内存滞留**。GC 每 3ms 就收割一轮，`heapAlloc` 峰值只有 3.9MB（heap profile 实测滞留 timer 仅 ~4700 个对象）。"内存没涨"完全无法反映这笔开销——7.2GB 是从 GC 的口袋里走的。
2. **`NewTimer`+`Stop` 是无效修复**。分配量一分不少（248B/3 allocs），GC 依旧 1841 次。Stop 只做一件事：把 timer 从堆里摘出来免滞留——但滞留本来就不是热循环的主账单。
3. **`Reset` 复用才是 0 分配**。单测确认 `BenchmarkNewTimerReset: 0 B/op, 0 allocs/op, 117ns/op`；6 秒跑完 GC 计数为 0，且因为没有 GC 抢占，吞吐从 5.1M/s 提到 8.5M/s——**同样的循环体，性能差 67%**。

## 三、机制：这笔账单怎么算出来的

分配速率 = 循环频率 × 单次分配量。模式 A 每秒跑 5.1M 次 × 248B ≈ 1.26GB/s 的分配率（与 totalAlloc 7.2GB/6s 吻合）。Go GC 的触发条件以分配量为阈值（GOGC=100 时约每翻倍触发一次），1.26GB/s 的分配率把 GC 压到每 3ms 一轮——每轮标记 + 清扫又反过来占 CPU，把循环速度拖慢 40%。

为什么滞留反而小？两个机制叠加：

- **timer 到期即弃**：`sendTime` 往 channel 发送时无人接收（select 走了 default），timer 在 `cleanHead` 中被惰性移除；
- **zombie 标记**：runtime 用 `zombies` 计数标记待移除项，堆清理是批量的、惰性的（runtime/time.go 的 `timers` 结构），不逐个立刻搬移。

所以热循环 + `time.After` 的画像不是"内存泄漏"（上一篇文章《[goroutine 泄漏不是内存泄漏](/writing/go-goroutine-leak-pprof)》讲过：内存正常 ≠ 没问题），而是"**每 3ms 一次 GC 的隐形税**"——调度曲线看不出异常，GC 曲线和 CPU 曲线会。

## 四、为什么 Stop 不救你：API 的语义差

`NewTimer`+`Stop` 每轮新建之所以无效，是因为 `Stop()` 不是"取消分配"，而是"取消挂账"：分配已经发生（channel + timer 对象 + 堆插入全做了），Stop 只是把 timer 标记为 zombie、等惰性清理。分配是同步的、实打实的；滞留才是可以推迟的。

这也是 `time.After` API 设计的必然结果：它返回 `<-chan Time`，**没有任何句柄能提前撤销**。想要撤销语义，就必须回到 `NewTimer`/`context`。所以选型其实是两个维度的事：

| 场景 | 频率 | 结论 |
|---|---|---|
| 请求级一次性超时（`select` 等 RPC/锁/队列） | 每秒个位数~百 | `time.After` 无妨，分配量可忽略 |
| 循环内每轮超时判断（轮询、心跳、重试） | 每秒千级+ | 必须 `NewTimer` + `Reset` 复用 |
| 需要提前取消/停止 | 任意 | 必须 `NewTimer`（或 `context.WithTimeout`） |

判别标准一句话：**如果同一段代码在循环体里反复执行且每次都 new 一个超时，就是逃税窗口**。写代码时的防线：循环外的 timer 只建一次；每轮要么 `Reset`，要么 `Stop` 后用完即弃。

## 五、验证与收尾的排查姿势

线上排查这类问题时，别只盯着 heapAlloc（它确实不会涨）：

1. `runtime.MemStats` 或 `/debug/metrics` 看 `NumGC` 增长速率——热循环场景 GC 频率是最先暴露问题的指标；
2. 分配热点用 `pprof -sample_index=alloc_space` 抓分配视图：`time.newTimer` 累积在哪个调用栈，就是哪个循环在逃税（实测抓出来是 `time.newTimer → time.NewTimer`，再往上是你的循环函数）；
3. 修复后同一指标对照：GC 次数应当归零或下降几个量级（本实验 2024 → 0）。

注意别用 `-sample_index=alloc_space` 的字节数当精确值（采样粒度 512B，本实验 1024kB 的样本对应 248B 的真实分配），它只适合定位热点，精确数字以 `testing.B` 的 `-benchmem` 为准。

## 结论

`time.After` 的真实成本是"每次调用 248B/3 allocs + 定时器堆挂账"，热循环里放大成 GC 频率税：6 秒 7.2GB 分配、2024 次 GC、吞吐打七折。`NewTimer`+`Stop` 救不了分配（账单相同），真正的 0 分配修复是**循环外建一次、每轮 `Reset`**：GC 归零、吞吐 +67%。与上一篇文章呼应：内存指标无感不等于没有泄漏/开销，两篇都是"选对尺子"的练习——那篇的尺子是 goroutine 视图，这篇是 `NumGC` 与 `alloc_space` 视图。

下一步可做的事：把你代码库里所有 `time.After` 的调用点过一遍，凡是出现在循环体或高频函数里的，改成循环外 `NewTimer` + `Reset`；跑一遍 `-benchmem` 对照，把 GC 次数和分配量记录进你的性能基线。

## 参考资料

1. Go 源码 `time/sleep.go`（`After` = `NewTimer(d).C`）—— Go 1.25.1 本机源码
2. Go 源码 `runtime/time.go`（per-P `timers` 堆、`zombies` 惰性移除）—— Go 1.25.1 本机源码
3. Go 官方文档 `runtime/metrics` 与 pprof 分配视图—— https://pkg.go.dev/runtime/pprof
4. 前作：[goroutine 泄漏不是内存泄漏](/writing/go-goroutine-leak-pprof)、[Go 内存泄漏与 pprof 的账本](/writing/go-memory-leak-pprof)