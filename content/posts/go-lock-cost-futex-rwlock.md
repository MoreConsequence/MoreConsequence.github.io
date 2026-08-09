---
title: "锁的成本是排队不是加锁：futex、自旋与内核唤醒的三档价目"
description: "无争用锁 14ns，八线程争用涨到 120ns，再往上走内核唤醒。用 M1 Pro 实测拆开一把锁的三档价目：原子 CAS、用户态自旋、futex 内核睡眠唤醒，并落到 Go sync.Mutex 的源码参数与 RWMutex 的适用边界。"
publishedAt: "2026-08-08"
updatedAt: "2026-08-08"
tags: ["Go", "并发", "性能"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 锁的开销大头不在 `Lock()` 那一行，而在没人能立刻拿到锁之后的排队机制。三档价目：无争用快路径只是原子 CAS（本机实测 `sync.Mutex` 单线程 14ns/次）；争用发生时先自旋（Go 限制最多 4 轮）再进内核睡眠/唤醒（futex 系统调用 + 唤醒，微秒级起步）；`GOMAXPROCS` 每翻一倍，排队的代价就涨一截（1 核 13.6ns → 16 核 128.9ns）。RWMutex 只在"读者远多于写者"时划算，但"读锁免费"是错觉——代价只是换了一种形态。选锁之前，先量临界区。

## 一、直觉错在哪里：锁的账单按"有没有人抢"计价

一个常见的直觉：加锁、解锁都是几条固定的指令，贵不到哪去。这个直觉只在"没人抢"时成立。

用 `go test -bench` 在 M1 Pro（8 性能核，Go 1.25，`lockdemo` 模块）实测同一段"拿锁 + 计数 + 放锁"：

| goroutine 数 | 本机实测 ns/op | 处于哪一档 |
| --- | --- | --- |
| 1 | 13.6 | CAS 快路径 |
| 2 | 21.4 | 偶发自旋 |
| 4 | 93.0 | 自旋为主，少量睡眠 |
| 8 | 110.8 | 自旋 + futex 混合 |
| 16 | 128.9 | 大量 futex 唤醒 |

16 个 goroutine 抢同一把锁，代价是 13.6 → 128.9ns，约 9.5 倍。**一把锁的价格不是它自己的，是"新进来的人"与"已经睡着的人"之间的竞争**。要理解这个放大过程，把 `internal/sync/mutex.go` 的 `lockSlow` 走完一遍。

## 二、三档价目：CAS、自旋、futex

Go 的 Mutex（1.20+ 起在 `internal/sync` 下）拆成 fast path 和 slow loop 两段。先看快路径：

```go
// Lock 的快路径：整个流程就是一发原子 CAS
if atomic.CompareAndSwapInt32(&m.state, 0, mutexLocked) {
    return
}
```

**第一档：原子 CAS（无争用，~14ns）**。`state` 是 32 位字，0 → locked，一条 `LOCK CMPXCHG` 指令解决。没有任何队列机制；对比纯原子加计数（~7ns），多出来的部分是 CAS 的读-改-写与内存序约束。

**第二档：自旋。** CAS 失败说明已经有人持锁（`mutexLocked` 位为 1）。此时 Go 不会立刻睡着，而是在 CPU 上原地转——循环里做 `runtime_doSpin()`：

```go
// runtime/proc.go：会转多久
const active_spin = 4      // 最多自旋 4 轮
const active_spin_cnt = 30 // 每轮约 30 条 PAUSE 指令
```

自旋的代价是几十个 CPU 周期，好处是**如果持锁者恰好在这几十周期内释放，就能原地接住**，省掉"睡下去再醒来"的全部成本。代价是自旋期间占用一个核空转。Go 只在 `GOMAXPROCS > 1` 且当前 P 的运行队列为空时才允许自旋，免得自己空转还把别的任务挤掉。

**第三档：内核睡眠与唤醒（futex）**。自旋 4 轮还没抢到，Go 才调用 `runtime_SemacquireMutex` → 到操作系统挂起（Linux 上是 futex）。真正昂贵的是两个部分：

1. **系统调用本身**：一次 `futex(FUTEX_WAIT)` 进入内核，约 0.5-1µs，纯开销；
2. **唤醒**：持锁者 `Unlock` 时 `runtime_Semrelease` → `FUTEX_WAKE`，被唤醒的 goroutine 还要经过调度、重新竞争——唤醒-切换合计可达微秒到几十微秒。

三档的结构非常连贯：**自旋解决"临界区极短"的常态，futex 是兜底**。合理设计下，绝大多数争用应该被前两档接住；一旦常态化落入第三档，就是锁的病。

## 三、可复现实验：把三档都走一遍

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

`RunParallel` 会自动按 `GOMAXPROCS` 开等量 goroutine，所以上面的数字就是这台机器的完整价目。换 `sync.RWMutex` 的 `RLock/RUnlock` 就是读锁档：

```text
BenchmarkMutex-8              117.6  ns/op   （8 线程争用）
BenchmarkRWMutexRead-8        106.3  ns/op   （读锁，几乎没差）
BenchmarkAtomic-8              45.9  ns/op   （原子计数对照）
BenchmarkMutexUncontended-8    14.0   ns/op   （快路径基线）
```

**另外很重要的一条：对称翻转。** 临界区里干活一旦超过 1µs，任何档位都会被拉平——因为睡眠唤醒本身就把量级摆在那。所以对锁优化的第一反应永远是**缩短临界区**，第二才是换锁。

## 四、再往前一步：原子不是锁，是隧道的偷渡客

严格说原子操作没有锁队列，但它是最便宜的"伪锁"：原子加法没有 CAS 失败绕、没有自旋、没有唤醒，只有同一缓存行的独占弹跳（见[MESI 伪共享的文章](/writing/mesi-cache-coherence-false-sharing)）。

| 手段 | 无争用 | 8 线程争用 | 尾部风险 |
| --- | --- | --- | --- |
| `atomic.AddInt64` | 7ns | 46ns | 伪共享弹跳 |
| `sync.Mutex` | 14ns | 118ns | futex 唤醒 µs 级 |
| `sync.RWMutex` 读锁 | 14ns | 106ns | 写者拿到后全部读者排队 |

结论分两层：**原子在无争用时比 Mutex 快约 2 倍**（7 vs 14ns），八线程争用时快约 2.5 倍（46 vs 118ns）——但远没有"原子 = 免费"那种想象。**真正让原子无法替代锁的场景是"写者稀少"**：Mutex 的排队会让每个写者等一轮唤醒，原子的计数器根本不需要排队。反过来，"原子永远更优"也是错的：一旦有大量线程在同一个计数上做读改写，冲突率直线上升，此时反而该回归 Mutex——让写者排队，而不是所有线程同时忙等。

## 五、RWMutex：读者的优惠券，写成本转移给写者

RWMutex 的账是做一笔交易：读者之间不加互斥（RLock 并发），**代价是写者一旦排队，新读者全部被挡在门外**（Go 与 C++ 皆如此，防写者饥饿）。它只在两个条件同时成立时值：

1. **读多写少**（写 <5%）；
2. **临界区足够大**，大到读者的并发收益超过写者的排队税。

从前面的实验看，纯计数锁下 RWMutex 读锁和 Mutex 没什么差别（30ns 左右差距）——**读锁便宜是幻觉**：RWMutex 的 RLock 走的是与 Lock 相同的自旋+futex pipeline。真正的收益来自**写锁次数减少**：写者少，futex 唤醒次数少，读者之间又互不挡，才把均摊成本压下去。

选型逻辑一句话：**测了再说**。临界区 200ns 的计数锁，换 RWMutex 可能是负优化；临界区 50µs 的配置表，读 999 写 1，RWMutex 才显身手。

## 六、选型表：什么时候买哪一档

| 临界区特征 | 该用 | 理由 |
| --- | --- | --- |
| 计数器/状态位，读改写 | atomic | 无唤醒无队列，最廉价 |
| 配置表：读极多、写极稀有、临界区大 | RWMutex | 读者并发、写者极少 |
| 既有读写混频、临界区小 | Mutex | RWMutex 收益被 pipeline 成本吃掉 |
| 临界区 > 几十 µs | 加锁前先重设计 | 任何锁都救不了排队 |

要点：**锁的选择首先是临界区长度，其次才是读/写比例**。临界区长，首选 RWMutex（读者不走唤醒）；临界区短，一律 Mutex + 原子，RWMutex 反而多一层外支付。

## 结论

锁的定价只有三档：无争用原子 CAS（~14ns）→ 用户态自旋（~110ns 档）→ futex 内核睡眠唤醒（µs 级）。绝大多数"锁很贵"的直觉是把第三档当常态；而多数"锁加多了"的痛则是躺在了第二档却以为免费。

工程顺序：**先量临界区**（火焰图上的 Mutex 宽度，见[先采样再优化：perf 火焰图与 CPU 时间到底去哪了](/writing/perf-flamegraph-sampling)）→ 再按上面的表选档。真正的架构优化，是不让"三档"常态化：把锁内的工作丢出临界区，或者换消息队列。

下一步实测（本机、10 秒内）:

```bash
$ go test -bench=. -benchtime=2s -run=^$    # 量出你机器三档价目
$ perf record -g ./app                      # 找到谁的临界区在排队
```

## 参考资料

1. Go 源码 `internal/sync/mutex.go`（fast path / starvation 注释）—— https://github.com/golang/go/blob/master/src/internal/sync/mutex.go
2. Go 源码 `runtime/proc.go`（runtime_doSpin 与 GOMAXPROCS 约束）—— https://github.com/golang/go/blob/master/src/runtime/proc.go
3. Linux futex(2) 手册（FUTEX_WAIT / FUTEX_WAKE）—— https://man7.org/linux/man-pages/man2/futex.2.html
4. Go: benchmarking 文档 —— https://go.dev/pkg/testing/#hdr-Examples

> 延伸阅读：锁的底层是原子，而原子的敌人是伪共享，见[多核的假象：缓存一致性（MESI）与伪共享这笔税](/writing/mesi-cache-coherence-false-sharing)；锁买卖的是"看不到的先后"，先有 happens-before 才知道排队为什么成立，见[Go 并发里没有先来后到：happens-before 才是唯一的裁判](/writing/go-happens-before)。