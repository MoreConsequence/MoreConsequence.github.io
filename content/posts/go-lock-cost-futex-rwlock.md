---
title: "锁的成本是排队不是加锁：Mutex、atomic 与自旋的争用曲线"
description: "一次本机 Go 1.25.1/arm64 基线显示，8 个并发 worker 下 atomic 为 39.65ns、Mutex 为 99.26ns、纯自旋锁为 250.1ns；16 个 worker 下纯自旋升到 572.8ns。文章从 Go runtime 的 fast/slow path 解释排队、自旋与 OS semaphore 的边界，并明确当前 Darwin 证据不能冒充 Linux futex 实测。"
publishedAt: "2026-08-08"
updatedAt: "2026-08-16"
tags: ["Go", "并发", "性能"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 锁的开销大头不在 `Lock()` 这一行，而在竞争后如何排队。本机统一基准（Go 1.25.1、Darwin arm64、`-cpu=2,4,8,16`）中，8 个并发 worker 下 `atomic.AddInt64` 为 **39.65ns/op**，`sync.Mutex` 为 **99.26ns/op**，故意持续占 CPU 的自旋锁为 **250.1ns/op**；16 个 worker 下自旋锁升到 **572.8ns/op**。这些数字只证明当前实现、机器和临界区形状下的争用曲线；Go runtime 的 semaphore 路径在 Linux 上可能落到 futex，但本次没有 Linux 运行证据。`RWMutex` 也不能凭“读锁免费”或固定读写比例选型，必须用同语义 workload 重测。

## 一、直觉错在哪里：锁的账单按"有没有人抢"计价

一个常见的直觉：加锁、解锁都是几条固定的指令，贵不到哪去。这个直觉只在"没人抢"时成立。

用统一入口 `experiments/go-runtime-boundary/bench_test.go` 在 M1 Pro（Go 1.25.1）实测同一段“并发读改写 + 极短临界区”。表中不是按“越多 worker 必然越慢”的排序，而是保留完整观测：CPU 频率、调度和 benchmark 时长会让相邻点波动。

| 并发 worker | atomic | `sync.Mutex` | 纯自旋锁 |
| --- | --- | --- | --- |
| 2 | 22.93ns | 28.08ns | 39.30ns |
| 4 | 46.69ns | 94.71ns | 137.8ns |
| 8 | 39.65ns | 99.26ns | 250.1ns |
| 16 | 50.89ns | 127.8ns | **572.8ns** |

在这组输入里，16 个 worker 的 `sync.Mutex` 是 127.8ns，而纯自旋锁是 572.8ns；**一把锁的价格不是它自己的，是“新进来的人”与“已经在等待的人”之间的竞争**。atomic 的 8 worker 点低于 4 worker，也提醒我们不要把一台机器的一次运行画成单调增长定律。要理解差异，应把 `sync.Mutex` 的 `lockSlow`、runtime semaphore 和自旋实现一起看。

## 二、三条路径：fast path、自旋与等待者队列

Go 的 Mutex（1.20+ 起在 `internal/sync` 下）拆成 fast path 和 slow loop 两段。先看快路径：

```go
// Lock 的快路径：整个流程就是一发原子 CAS
if atomic.CompareAndSwapInt32(&m.state, 0, mutexLocked) {
    return
}
```

**第一档：fast path。** `state` 处于可获取状态时，`Lock` 会尝试一次原子状态转换；它没有经过等待者队列。具体 ns/op 取决于架构、编译器和 benchmark 外围，不应把某个旧版本的 14ns 当成固定价格。

**第二档：自旋。** CAS 失败说明已经有人持锁（`mutexLocked` 位为 1）。此时 Go 不会立刻睡着，而是在 CPU 上原地转——循环里做 `runtime_doSpin()`：

```go
// runtime/proc.go：会转多久
const active_spin = 4      // 最多自旋 4 轮
const active_spin_cnt = 30 // 每轮约 30 条 PAUSE 指令
```

自旋的代价是几十个 CPU 周期，好处是**如果持锁者恰好在这几十周期内释放，就能原地接住**，省掉"睡下去再醒来"的全部成本。代价是自旋期间占用一个核空转。Go 只在 `GOMAXPROCS > 1` 且当前 P 的运行队列为空时才允许自旋，免得自己空转还把别的任务挤掉。

**第三档：等待与唤醒。** 自旋仍拿不到锁后，Go 会进入 `runtime_SemacquireMutex` 等待；具体由操作系统的 semaphore 实现承接，Linux 常见底层是 futex，但 Darwin 本次没有用 futex 证据。真正昂贵的是两个部分：

1. **等待交接**：调用方可能离开用户态并等待 runtime/OS 的唤醒；平台和系统负载决定具体延迟；
2. **唤醒后重新竞争**：被唤醒的 goroutine 还要经过调度并重新争抢状态，尾延迟可能远高于无争用 fast path。

三条路径的结构非常连贯：**自旋试图解决“临界区极短”的常态，等待队列负责把无法立即获得锁的 goroutine 暂停下来**。当前 Darwin 基准只观察到最终 ns/op，不能反推出每个样本是否进入了某个 OS 等待原语。

## 三、可复现实验：最小示例与完整争用矩阵

下面是帮助读者理解 `RunParallel` 形状的最小示例；它不是当前统一基准的完整实现，完整的 atomic、Mutex、自旋和 worker 矩阵见下方实验入口与 raw 输出。

```go
package lockdemo

import (
	"sync"
	"testing"
)

var sink int64

func BenchmarkMutex(b *testing.B) {
	var mu sync.Mutex
	var n int64
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			mu.Lock()
			n++
			mu.Unlock()
		}
	})
	sink = n
}
```

`RunParallel` 会按 benchmark 的 `-cpu` 设置提供并发 worker。统一入口实际运行的是 atomic、Mutex 和故意持续占 CPU 的自旋锁三条路径：

```text
BenchmarkAtomicParallel-8       39.65 ns/op   0 B/op  0 allocs/op
BenchmarkMutexParallel-8       99.26 ns/op   0 B/op  0 allocs/op
BenchmarkSpinParallel-8       250.1  ns/op   0 B/op  0 allocs/op
BenchmarkMutexParallel-16     127.8  ns/op   0 B/op  0 allocs/op
BenchmarkSpinParallel-16      572.8  ns/op   0 B/op  0 allocs/op
```

复现命令和原始输出绑定在文末 evidence。**另外很重要的一条：不要只换锁。** 如果临界区中混入 I/O、序列化或长计算，等待和尾延迟会淹没这些微基准差异；锁优化的第一反应仍应是缩短临界区，第二才是换原语。

## 四、再往前一步：原子不是锁，是隧道的偷渡客

严格说原子操作没有锁队列，但它是最便宜的"伪锁"：原子加法没有 CAS 失败绕、没有自旋、没有唤醒，只有同一缓存行的独占弹跳（见[MESI 伪共享的文章](/writing/mesi-cache-coherence-false-sharing)）。

| 手段 | 4 worker | 8 worker | 16 worker |
| --- | --- | --- | --- |
| `atomic.AddInt64` | 46.69ns | 39.65ns | 50.89ns |
| `sync.Mutex` | 94.71ns | 99.26ns | 127.8ns |
| 纯自旋锁 | 137.8ns | 250.1ns | **572.8ns** |

结论分两层：**原子在这组短计数临界区中通常低于 Mutex**，但它不提供互斥、不保护复合不变量，也不能从这张表推导“原子永远更优”。纯自旋锁在 worker 增加时明显恶化，说明它把等待成本直接转成 CPU 消耗；如果临界区稍长，系统吞吐和功耗会先付出代价。

## 五、RWMutex：读者的优惠券，写成本转移给写者

RWMutex 的账是做一笔交易：读者之间不加互斥（RLock 并发），**代价是写者一旦排队，新读者全部被挡在门外**（Go 与 C++ 皆如此，防写者饥饿）。它只在两个条件同时成立时值：

1. **读写访问存在真实的并发重叠**；
2. **临界区足够长或读者足够多**，读者并发收益能够超过 `RLock`/写者排队的额外状态维护。

本轮没有把 `RWMutex` 读锁纳入统一 raw，因此不为它填一条“106ns”或“写 <5%”的经验常数。真正的收益来自读者之间不互斥，但写者到来时新读者会被挡住；必须在实际读写比、临界区和快照语义下补测。

选型逻辑一句话：**测了再说**。小计数临界区先比较 atomic/Mutex；需要保护复合状态时再考虑 Mutex/RWMutex；配置表等读多写少场景要把写者排队、快照和更新频率一起放进 benchmark。

## 六、选型表：什么时候买哪一档

| 临界区特征 | 该用 | 理由 |
| --- | --- | --- |
| 单个计数器，读改写不涉及其他状态 | atomic | 不需要互斥，当前短临界区对照更低 |
| 需要保护多个字段或复合不变量 | Mutex | 语义直接，等待者不会持续烧 CPU |
| 读远多于写、且读者可并发 | RWMutex | 让多个读者同时进入，但必须测写者排队 |
| 临界区包含 I/O/长计算 | 先重设计临界区 | 任何锁都不能消除把慢工作放在锁内的代价 |

要点：**锁的选择首先是保护的语义，其次才是微基准**。不能用 atomic 的速度替代复合状态的互斥，也不能因为 RWMutex 有读并发就跳过写者排队和快照一致性分析。

## 七、结论：先固定临界区语义，再看竞争曲线

当前证据支持的判断是：8 worker 下 atomic **39.65ns**、Mutex **99.26ns**、纯自旋 **250.1ns**；16 worker 下纯自旋到 **572.8ns**。这是一条当前 Darwin arm64、短临界区、`-cpu=2,4,8,16` 的争用观察，不是锁的固定价目，也没有证明每个样本都进入了某个 Linux futex syscall。

工程顺序：**先量临界区**（火焰图上的 Mutex 宽度，见[先采样再优化：perf 火焰图与 CPU 时间到底去哪了](/writing/perf-flamegraph-sampling)）→ 再确认是单值原子、复合状态 Mutex，还是读写分离 RWMutex → 最后用实际竞争曲线验证。真正的架构优化，是不让锁内工作包含 I/O、远程调用或不可控计算。

本机复现实验：

```bash
cd experiments
go test ./go-runtime-boundary -run '^$' -bench '^(BenchmarkAtomicParallel|BenchmarkMutexParallel|BenchmarkSpinParallel)$' -benchmem -benchtime=1s -cpu=2,4,8,16
```

## 参考资料

1. Go 源码 `internal/sync/mutex.go`（fast path / starvation 注释）—— https://github.com/golang/go/blob/master/src/internal/sync/mutex.go
2. Go 源码 `runtime/proc.go`（runtime_doSpin 与 GOMAXPROCS 约束）—— https://github.com/golang/go/blob/master/src/runtime/proc.go
3. Linux futex(2) 手册（FUTEX_WAIT / FUTEX_WAKE）—— https://man7.org/linux/man-pages/man2/futex.2.html
4. Go: benchmarking 文档 —— https://go.dev/pkg/testing/#hdr-Examples
5. 本文实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkAtomicParallel`、`BenchmarkMutexParallel`、`BenchmarkSpinParallel`）；环境与原始输出：`evidence/go-runtime-boundary/2026-08-16-local/`。

> 延伸阅读：锁的底层是原子，而原子的敌人是伪共享，见[多核的假象：缓存一致性（MESI）与伪共享这笔税](/writing/mesi-cache-coherence-false-sharing)；锁买卖的是"看不到的先后"，先有 happens-before 才知道排队为什么成立，见[Go 并发里没有先来后到：happens-before 才是唯一的裁判](/writing/go-happens-before)。
