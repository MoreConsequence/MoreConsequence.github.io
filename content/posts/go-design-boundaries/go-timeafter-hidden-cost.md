---
title: "time.After 的隐藏账单：248B 分配不是 Stop 能消掉的"
description: "一次本机 Go 1.25.1/arm64 基线测得：time.After 为 190.6ns、248B/3 allocs，NewTimer+Stop 仍为 157.2ns、248B/3 allocs，只有循环外 NewTimer+Reset 降到 40.83ns、0 allocs。文章解释 timer 生命周期、Stop 与 Reset 的不同合同，并把单机数字与生产 GC 结论分开。"
publishedAt: "2026-08-11"
updatedAt: "2026-08-16"
tags: ["Go", "性能优化", "GC"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** `time.After` 返回的是 `NewTimer(d).C`，它方便，但每次调用仍会建立新的 timer 状态。统一入口在 Go 1.25.1/arm64 下测得：`time.After` **190.6ns、248B/3 allocs**；每轮 `NewTimer` 再 `Stop` 仍是 **157.2ns、248B/3 allocs**；循环外创建一次并 `Reset` 复用则是 **40.83ns、0 allocs**。这证明 `Stop` 取消的是 timer 的等待语义，不是已经发生的分配；高频循环才值得改成复用 timer，低频一次性等待不必为了一个 benchmark 数字增加复杂度。

## 一、先看真相：time.After 不是定时器，是定时器的构造函数

很多人把 `time.After(d)` 当作"免费的等待"——和 `time.Sleep` 并列。源码里它是这样的（Go 1.25.1）：

```go
// time/sleep.go
func After(d Duration) <-chan Time {
	return NewTimer(d).C
}
```

也就是说每次调用 `time.After(5*time.Second)`，实际发生三件事：

1. 创建一个可接收时间值的 channel 和 timer 状态；
2. 把 timer 加入 runtime 管理的定时器队列；
3. 返回只读 channel，调用者拿不到可以主动停止的 `*Timer` 句柄。

当前入口用 `testing.B` 测得单次成本（本机 Go 1.25.1）：

```
BenchmarkTimeAfterHour-8       190.6 ns/op   248 B/op   3 allocs/op
BenchmarkNewTimerStop-8        157.2 ns/op   248 B/op   3 allocs/op
BenchmarkNewTimerReset-8        40.83 ns/op     0 B/op   0 allocs/op
```

复现实验使用同一份 benchmark 入口：

```bash
cd experiments
go test ./go-runtime-boundary -run '^$' -bench '^(BenchmarkTimeAfterHour|BenchmarkNewTimerStop|BenchmarkNewTimerReset)$' -benchmem -benchtime=1s -cpu=8
```

248B/3 次分配——这个数字本身不大，但在高频循环里会按调用次数线性累加。**`time.After` 没有配套的 `Stop` 入口**：你拿到的是 channel，不是 `*Timer`。是否回收、何时从 runtime 队列移除由运行时版本和 timer 状态决定；文章只把当前 benchmark 的分配结果当作证据，不把它外推成固定 GC 周期。

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

示例中的 `5*time.Second` 是业务语义示意；统一 benchmark 使用 `time.Hour`，让计时只覆盖 timer 的构造、停止或复用，不让测试等待到期。两者比较的是同一类非阻塞 API 形状，具体数值仍应按目标 Go 版本和业务等待方式复测。

模式 B（`NewTimer` + `Stop` 每轮新建）也一并测。统一 benchmark 的结果是：

| 模式 | ns/op | B/op | allocs/op | 这次实验改变了什么 |
|---|---:|---:|---:|---|
| A. `time.After` 每轮新建 | **190.6** | **248** | **3** | 创建 timer 并只保留 channel |
| B. `NewTimer` + `Stop` 每轮新建 | **157.2** | **248** | **3** | 拿到句柄，但每轮仍创建对象 |
| C. 循环外 `NewTimer` + `Reset` | **40.83** | **0** | **0** | 复用同一个 timer |

三个结论，每一个都反直觉：

1. **分配量随调用次数线性增长**。本次每次 `time.After` 是 248B；如果业务真的达到 1,000,000 次/s，粗略分配速率就是约 248MB/s，但实际 GC 次数还取决于 live heap、GOGC、其他分配和 CPU，不能从这个乘法直接推出“每几毫秒一次 GC”。
2. **`NewTimer` + `Stop` 不是省分配的修复**。它比 `time.After` 略快，但仍是 248B/3 allocs；Stop 只改变 timer 是否继续等待，不会撤销已经完成的构造。
3. **`Reset` 复用才是本实验的 0 分配路径**。循环外创建一次 timer 后，当前 benchmark 是 40.83ns、0 B/op、0 allocs/op；这是一种分配与 GC 压力的局部改进，不自动证明真实服务 p99 会按同样比例改善。

## 三、机制：这笔账单怎么算出来的

分配速率 = 循环频率 × 单次分配量。当前 benchmark 给出一个可重算的局部公式：`1,000,000 calls/s × 248 B/call ≈ 248 MB/s`。但 Go GC 的触发条件还受 live heap、GOGC、GOMEMLIMIT、其他对象和 CPU 影响；因此这里不再把某次 6 秒热循环的 GC 次数外推成所有服务的周期。

为什么“分配多”不等于“长期滞留多”？运行时会在 timer 到期、停止或不可达后按自己的队列策略清理；具体可观察行为要绑定 Go 版本和 timer 是否仍有引用：

- `select` 走 default 只说明本次没有消费 channel，不等于可以从 API 层主动撤销 timer；
- Go runtime 会根据 timer 状态和版本实现清理队列，不能用一次 `heapAlloc` 读数替代分配速率和 GC 观测。

所以热循环 + `time.After` 的核心画像是“高分配速率”，不是一条可以跨版本复用的“每 3ms 一次 GC”定律；诊断时应同时看 `alloc_space`、`/gc/cycles/total`、CPU 和请求延迟。

## 四、为什么 Stop 不救你：API 的语义差

`NewTimer`+`Stop` 每轮新建之所以无效，是因为 `Stop()` 不是"取消分配"，而是"取消挂账"：分配已经发生（channel + timer 对象 + 堆插入全做了），Stop 只会让运行时把 timer 标记为停止并在后续维护中清理。分配是同步的、实打实的；滞留才是可以推迟的。

这也是 `time.After` API 设计的必然结果：它返回 `<-chan Time`，**没有任何句柄能提前撤销**。想要撤销语义，就必须回到 `NewTimer`/`context`。所以选型其实是两个维度的事：

| 场景 | 频率 | 结论 |
|---|---|---|
| 请求级一次性超时（`select` 等 RPC/锁/队列） | 每秒个位数~百 | `time.After` 无妨，分配量可忽略 |
| 循环内每轮超时判断（轮询、心跳、重试） | 每秒千级+ | 必须 `NewTimer` + `Reset` 复用 |
| 需要提前取消/停止 | 任意 | 必须 `NewTimer`（或 `context.WithTimeout`） |

判别标准一句话：**如果同一段代码在循环体里反复执行且每次都 new 一个超时，就是逃税窗口**。写代码时的防线：循环外的 timer 只建一次；每轮要么 `Reset`，要么 `Stop` 后用完即弃。

## 五、验证与收尾的排查姿势

线上排查这类问题时，别把单点 `heapAlloc` 读数当成分配速率：它可能在 GC 前上升、回收后回落；

1. `runtime.MemStats` 或 `/debug/metrics` 看 `NumGC` 增长速率——热循环场景 GC 频率是最先暴露问题的指标；
2. 分配热点用 `pprof -sample_index=alloc_space` 抓分配视图，确认 `time.newTimer` 的调用栈是否回到你的循环函数；不要把 pprof 的采样字节数当成 `testing.B` 的精确单次分配；
3. 修复后用同一输入对照 `B/op`、`allocs/op`、GC cycles 和请求延迟；本次 benchmark 能证明前两项，不替代真实服务的长时间运行记录。

注意别用 `-sample_index=alloc_space` 的字节数当精确值；它适合定位热点，精确的单次分配数字以 `testing.B` 的 `-benchmem` 为准。

## 六、结论：高频循环要复用 Timer，别把 Stop 当成反分配工具

`time.After` 的当前 benchmark 成本是 **190.6ns、248B/3 allocs**；`NewTimer` + `Stop` 仍分配；循环外复用 `Reset` 则是 **40.83ns、0 B/op、0 allocs/op**。这组结果支持一个窄而可靠的判断：**高频循环如果只需要重复等待，应复用 timer；低频请求级一次性等待，可以优先选择更简单的 API。** 但要按目标 Go 版本的 Timer 合同迁移：Go 1.23 起，chan-based timer 的 `Reset`/`Stop` 返回后不会再收到旧值；面向更老版本时，必须遵守当时的 Stop 与 drain 规则，不能把两套语义混写。

下一步可做的事：把代码库里循环体和高频函数中的 `time.After` 列出来，先确认是否需要提前取消，再用当前 Go 版本的 `NewTimer` + `Reset` 写同语义 benchmark；保存 `-benchmem`、GC cycles 和业务延迟，不要只看 ns/op。

## 参考资料

1. Go 源码 `time/sleep.go`（`After` = `NewTimer(d).C`）—— Go 1.25.1 本机源码
2. Go 源码 `runtime/time.go`（per-P `timers` 堆、`zombies` 惰性移除）—— Go 1.25.1 本机源码
3. Go 官方文档 `time.Timer`、`time.After` 与 Go 1.23 timer channel 语义—— https://pkg.go.dev/time#Timer
4. Go 官方文档 pprof 分配视图—— https://pkg.go.dev/runtime/pprof
5. 前作：[goroutine 泄漏不是内存泄漏](/writing/go-goroutine-leak-pprof)、[Go 内存泄漏与 pprof 的账本](/writing/go-memory-leak-pprof)

实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkTimeAfterHour`、`BenchmarkNewTimerStop`、`BenchmarkNewTimerReset`）；环境与原始输出：`evidence/go-runtime-boundary/2026-08-16-local/`。
