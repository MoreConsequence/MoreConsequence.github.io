---
title: "atomic 与 Mutex：7ns 到 128ns 的成本曲线，与自旋锁的陷阱"
description: "统一 benchmark 在 Go 1.25.1/arm64 下测得 atomic.Add 约 7.4ns、Mutex 无竞争约 14.6ns；竞争 8 线程时 atomic 39.7ns vs Mutex 99.3ns，16 线程 50.9 vs 127.8ns。自旋锁从 39.3ns（2 线程）升到 572.8ns（16 线程），说明原语选择之外，减少共享竞争更重要。原始输出保留了 CPU 数和命令口径。"
publishedAt: "2026-08-14"
updatedAt: "2026-08-16"
tags: ["Go", "并发", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** atomic 与 Mutex 的成本差距随竞争程度变化，不是常数。统一 benchmark（`experiments/go-runtime-boundary`，Go 1.25.1/arm64）测得：单线程 `atomic.Add` **约 7.4ns**、Mutex Lock/Unlock **约 14.6ns**；竞争 8 线程为 **39.7ns vs 99.3ns**，16 线程为 **50.9ns vs 127.8ns**。自旋锁在同一入口上从 2 线程 **39.3ns** 升到 16 线程 **572.8ns**，不是通用捷径。真正稳定的判断不是某台机器上的精确常数，而是：atomic 只保护单个字，Mutex 保护组合不变量；高竞争时先拆共享状态。

## 一、本质差异：一条指令 vs 一个状态机

`sync.Mutex` 的运行时结构（Go 1.25 内部实现 `internal/sync/mutex.go`）：

```go
type Mutex struct {
	state int32 // mutexLocked | mutexWoken | mutexStarving + 等待者计数
	sema  uint32 // 内核信号量（futex）
}
```

Lock 的完整路径：CAS 抢锁快路径（几纳秒）→ 失败则自旋（runtime 自适应，约几十次）→ 再失败挂进 **futex 睡眠**，等解锁方 `runtime_Semrelease` 唤醒。所以 Mutex 的成本是三条路径的混合：**指令 + 自旋 + 内核往返**，随竞争程度在 14ns 到 121ns 间移动。

`atomic` 则不同：`AddInt64` 编译成单条硬件指令（amd64 是 `LOCK XADD`，arm64 是 LSE 的 `LDADDAL`），**没有锁对象、没有等待队列、没有内核参与**。它卖的是"单条指令的原子性"，买不到的是"多个变量的组合一致性"——atomic 一次只能保护一个字，Mutex 可以保护任意多的状态。

## 二、单线程基线：2 倍差距从哪来

本机实测（Go 1.25.1，arm64 8 核，无竞争）：

| 操作 | 本次基线 |
|---|---|
| `atomic.AddInt64` | **7.4ns** |
| `sync.Mutex` Lock/Unlock（无竞争） | **14.6ns** |

无竞争时 Mutex 的 14.6ns 全是快路径成本（CAS + 返回），但已经比裸指令的 Add 贵约 2 倍——Lock/Unlock 各一次 CAS + 参数检查 + 调用开销，还有内存屏障语义。**单字段计数器单线程用 atomic 很便宜**；这不意味着应该用 atomic 拼装多个字段的事务。

## 三、竞争曲线：atomic 走平，Mutex 恶化

多线程竞争同一计数器（本机实测，ns/op）：

| 线程数 | atomic.Add | Mutex | 自旋锁 |
|---|---|---|---|
| 2 | **22.9** | **28.1** | **39.3** |
| 4 | **46.7** | **94.7** | **137.8** |
| 8 | **39.7** | **99.3** | **250.1** |
| 16 | **50.9** | **127.8** | **572.8** |

（这些数字来自 `RunParallel`，`-cpu=2,4,8,16`，每行是一次当前 checkout 的基线；它们用于比较形状，不是硬件无关的常数。）

三个形状值得记住：

1. **atomic 没有单调恶化**（22.9→46.7→39.7→50.9）：arm64 的原子指令由硬件仲裁 cacheline，线程再多也会排队，但没有 Mutex 的睡眠唤醒路径。
2. **Mutex 在竞争下明显变贵**（28.1→94.7→99.3→127.8）：运行时会在自旋和挂起之间选择，具体曲线受调度器、核数和临界区影响；不要把某一轮的“线性”当成严格数学规律。
3. **自旋锁是陷阱**：它从 39.3ns 迅速涨到 572.8ns。没有退避和挂起出口时，超卖会让所有等待者占住 CPU，cacheline 也在核之间反复转移。

## 四、为什么自旋锁难写对：cacheline 弹跳与超卖

自旋锁的核心问题是所有权没有转移协议：持锁者解锁后，所有等待者同时发现锁空出来，**一起抢**——cacheline 在 N 个核之间弹跳 N 轮，每轮都是完整的内存一致性往返。Mutex 用 futex 把等待者按顺序挂起，唤醒只有一个，弹跳至多一轮。

Go 的 Mutex 还自带自适应自旋：runtime 只在"临界区可能很快结束"时自旋（默认最多 4 个自旋者，且只在多核下），超过就睡。**你手动写的 `for !CAS {}` 是无限自旋**——没有"算了去睡"的出口，也没有"只有我在自旋"的限制。16 线程时 16 个核全在抢一个 cacheline，吞吐直接腰斩（213ns vs 121ns）。

## 五、生产判断：三者的分界线

| 场景 | 选择 | 依据 |
|---|---|---|
| 计数器、标志位、引用计数 | `atomic.Int64` / `atomic.Bool` | 7.2ns vs 14.8ns+，且无内核风险 |
| 多字段一致性（状态机、缓存条目） | Mutex | atomic 一次一个字，组合一致性是锁的专利 |
| 读多写少 | RWMutex | 见前作，读锁是共享路径 |
| 临界区极短 + 线程 ≤ 核数 | 自旋锁（需压测验证） | 唯一窗口，实测 8 线程 81.2ns |
| 高竞争热点（>8 线程争一把锁） | 重构：分片/分 key | 任何锁都在恶化，atomic 也走平——拆数据比加锁技巧有效 |

最后一条是最重要的判断：**曲线告诉我们的是选择哪个原语，而不是怎样优化原语**。8 线程以上的热点，atomic 的 50ns 和 Mutex 的 121ns 都不是好数字——把计数器分片（每 P 一份，聚合时合）或改成无锁数据结构，才是真正的解。原语只有 7ns 的底，架构才能给 100 倍的顶。

## 六、结论：单字段用 atomic，多字段一致性用 Mutex


atomic 与 Mutex 的分界线是"一个字 vs 一组字段"：单字段计数在本机基准上是 7ns 量级，Mutex 无竞争是 15ns 量级，竞争后两者都上升但自旋锁上升更陡。多字段一致性不能靠多个 atomic 的顺序拼接，应该用 Mutex 或重新设计所有权。选型之外还有一个量级更高的杠杆：**竞争本身**——分片让竞争消失，比继续调原语更值得。

下一步可做的事：把你代码里 `Mutex` 保护的临界区扫一遍，凡只操作一个字段的换成 `atomic.*`；凡 >8 线程争抢的热点，先拆数据再谈锁。

## 参考资料

1. Go 源码 `internal/sync/mutex.go`（state+sema 状态机、正常/饥饿模式）—— Go 1.25.1 本机源码
2. Go 官方文档 `sync/atomic` 包—— https://pkg.go.dev/sync/atomic
3. 前作：[Go 锁成本](/writing/go-lock-cost-futex-rwlock)、[channel 的账本](/writing/go-channel-hchan-cost)

实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkAtomic*`、`BenchmarkMutex*`、`BenchmarkSpinParallel`）；原始输出：`evidence/go-runtime-boundary/2026-08-16-local/raw/contention.txt`、`environment.txt`。自旋锁的结果来自额外单独运行，命令同样使用 `-cpu=2,4,8,16`。
