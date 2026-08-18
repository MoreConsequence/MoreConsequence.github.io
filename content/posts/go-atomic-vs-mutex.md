---
title: "atomic 与 Mutex：7ns 到约 128ns 的争用曲线，不要把原语当银弹"
description: "统一 benchmark 在 Go 1.25.1/Darwin arm64 下测得 atomic.Add 无竞争约 7.4ns、Mutex Lock/Unlock 约 14.6ns；同一短临界区在 8 worker 时为 39.65ns vs 99.26ns，纯自旋锁为 250.1ns。文章把这些数字限定为当前 raw 的争用形状，重点回到 atomic 的单字语义、Mutex 的复合不变量和自旋等待的 CPU 代价。"
publishedAt: "2026-08-14"
updatedAt: "2026-08-17"
tags: ["Go", "并发", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** atomic 与 Mutex 的成本差距随竞争程度变化，不是常数。统一 benchmark（`experiments/go-runtime-boundary`，Go 1.25.1/Darwin arm64）测得：单线程 `atomic.Add` **约 7.4ns**、Mutex Lock/Unlock **约 14.6ns**；竞争 8 worker 为 **39.65ns vs 99.26ns**，纯自旋锁为 **250.1ns**。16 worker 时自旋锁升到 **572.8ns**。这些数字只证明当前实现、机器和短临界区的争用形状；稳定的工程判断是：atomic 只保护单个字，Mutex 保护组合不变量；高竞争时先拆共享状态。

## 一、本质差异：一条指令 vs 一个状态机

`sync.Mutex` 的运行时结构（Go 1.25 内部实现 `internal/sync/mutex.go`）：

```go
type Mutex struct {
	state int32 // mutexLocked | mutexWoken | mutexStarving + 等待者计数
	sema  uint32 // runtime semaphore token；底层等待机制随 OS 而变
}
```

Lock 的完整路径：CAS 抢锁快路径 → 失败后按 runtime 条件短暂自旋 → 再失败进入 runtime semaphore 等待，解锁方再唤醒等待者。Linux 的某些路径可能落到 futex，但 Darwin 不是本次 raw 的证明对象。Mutex 的成本是三条路径的混合：**指令 + 自旋 + 等待/唤醒**，随竞争程度和临界区形状变化。

`atomic` 则不同：`AddInt64` 由编译器针对目标架构生成原子读改写序列，具体是单条指令还是 LL/SC 等实现细节不能从这篇 Darwin 基准外推。它通常不创建锁对象或等待队列，但卖的是“单个值的原子性”，买不到“多个变量的组合一致性”——atomic 一次只能保护一个字，Mutex 可以保护任意多的状态。

## 二、单线程基线：2 倍差距从哪来

本机实测（Go 1.25.1，arm64 8 核，无竞争）：

| 操作 | 本次基线 |
|---|---|
| `atomic.AddInt64` | **7.4ns** |
| `sync.Mutex` Lock/Unlock（无竞争） | **14.6ns** |

无竞争时 Mutex 的 14.6ns 是这组短临界区的快路径基线，已经比 atomic.Add 的 7.4ns 高约 2 倍。**单字段计数器单线程用 atomic 很便宜**；这不意味着应该用 atomic 拼装多个字段的事务。

## 三、竞争曲线：两者都会排队，等待路径不同

多线程竞争同一计数器（本机实测，ns/op）：

| 线程数 | atomic.Add | Mutex | 自旋锁 |
|---|---|---|---|
| 2 | **22.9** | **28.1** | **39.3** |
| 4 | **46.7** | **94.7** | **137.8** |
| 8 | **39.7** | **99.3** | **250.1** |
| 16 | **50.9** | **127.8** | **572.8** |

（这些数字来自 `RunParallel`，`-cpu=2,4,8,16`，每行是一次当前 checkout 的基线；它们用于比较形状，不是硬件无关的常数。）

三个形状值得记住：

1. **atomic 没有单调恶化**（22.93→46.69→39.65→50.89）：共享 cacheline 仍然会在核之间争用，线程增加也不意味着每个点严格单调；这只是本机一次 `RunParallel` 形状。
2. **Mutex 在竞争下明显变贵**（28.1→94.7→99.3→127.8）：运行时会在自旋和挂起之间选择，具体曲线受调度器、核数和临界区影响；不要把某一轮的“线性”当成严格数学规律。
3. **自旋锁是一个需要谨慎证明的候选**：它从 39.30ns 迅速涨到 572.8ns。没有退避和挂起出口时，超卖会让所有等待者占住 CPU，cacheline 也在核之间反复转移。

## 四、为什么自旋锁难写对：cacheline 弹跳与超卖

自旋锁的核心问题是所有权没有转移协议：持锁者解锁后，所有等待者同时发现锁空出来，**一起抢**——cacheline 在 N 个核之间弹跳 N 轮，每轮都是完整的内存一致性往返。Mutex 由 runtime 管理等待和唤醒；具体是否使用 futex 是 OS 路径问题，不能把它写成所有平台的实现合同。

Go 的 Mutex 还自带 runtime 控制的自旋和等待路径；具体自旋次数、是否 park 以及 OS 等待机制都不应写成跨版本常数。**你手动写的 `for !CAS {}` 是无限自旋**——没有“算了去睡”的出口，也没有“只有我在自旋”的限制。当前 16 worker 的 572.8ns 只说明这组输入下 CPU 忙等迅速恶化，不是所有超卖场景的固定倍率。

## 五、生产判断：三者的分界线

| 场景 | 选择 | 依据 |
|---|---|---|
| 计数器、标志位、引用计数 | `atomic.Int64` / `atomic.Bool` | 当前无竞争基线约 7.4ns vs 14.6ns；先确认只有单值不变量 |
| 多字段一致性（状态机、缓存条目） | Mutex | atomic 一次一个字，组合一致性是锁的专利 |
| 读多写少 | RWMutex | 见前作，读锁是共享路径 |
| 临界区极短 + worker 接近核数 | 自旋锁只能作为候选 | 当前 raw 的 2/4/8/16 worker 曲线必须在目标机器重测 |
| 高竞争热点 | 优先评估分片/分 key | 当前短临界区中 atomic、Mutex、自旋都受共享 cacheline 影响；拆共享状态比换原语更可验证 |

最后一条是最重要的判断：**曲线告诉我们的是选择哪个原语，而不是怎样优化原语**。当共享状态成为热点时，atomic 和 Mutex 都可能在 cacheline 上排队；把计数器分片、按 key 分区或改成所有权转移，通常比继续微调 `Lock`/`CAS` 更值得验证。

## 六、结论：单字段用 atomic，多字段一致性用 Mutex


atomic 与 Mutex 的分界线是“一个字 vs 一组字段”：单字段计数在本机基准上是 7ns 量级，Mutex 无竞争是 15ns 量级，竞争后两者都上升但自旋锁在这组输入上上升更陡。多字段一致性不能靠多个 atomic 的顺序拼接，应该用 Mutex 或重新设计所有权。选型之外还有一个更高杠杆：**减少共享竞争本身**。

下一步可做的事：把 `Mutex` 保护的临界区按“单值 / 复合不变量 / 是否包含等待”分类；只操作一个值的路径再评估 `atomic.*`，高竞争热点先做分片或所有权实验。不要用 `>8` 这样的 worker 数阈值替代目标 workload 的证据。

## 参考资料

1. Go 源码 `internal/sync/mutex.go`（state+sema 状态机、正常/饥饿模式）—— Go 1.25.1 本机源码
2. Go 官方文档 `sync/atomic` 包—— https://pkg.go.dev/sync/atomic
3. 前作：[Go 锁成本](/writing/go-lock-cost-futex-rwlock)、[channel 的账本](/writing/go-channel-hchan-cost)

实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkAtomic*`、`BenchmarkMutex*`、`BenchmarkSpinParallel`）；原始输出：`evidence/go-runtime-boundary/2026-08-16-local/raw/contention.txt`、`environment.txt`。自旋锁的结果来自额外单独运行，命令同样使用 `-cpu=2,4,8,16`。
