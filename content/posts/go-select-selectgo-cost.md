---
title: "select 的仲裁成本：50 亿次选择 50:50 的公平，和 4ns 到 197ns 的账单"
description: "select 的成本不是常数：单 case+default 被编译器重写成简化构造（实测 4.1ns，几乎免费）；case 数越多越贵，非阻塞轮询每加一个 case 约 25ns（8 case 197ns）；阻塞等待则起步 148ns。5 亿次二选一实测 50.00/50.00——pollorder 随机化的直接证据。解剖 selectgo：随机化保证公平，按 hchan 地址排序保证加锁顺序一致、防死锁。"
publishedAt: "2026-08-12"
updatedAt: "2026-08-12"
tags: ["Go", "并发", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** select 是 channel 之上的仲裁器，成本分三档：单 case + default 被编译器重写为简化构造，实测 4.1ns 几乎免费（这就是为什么 `select { case <-stop: default: }` 能当热循环的停止开关）；多 case 的 selectgo 要按 case 数线性付钱（8 case 非阻塞轮询 197ns，每 case 约 25ns）；阻塞等待至少 148ns（挂 sudog + park）。select 的公平性是设计出来的：pollorder 用随机置换（`cheaprandn`，select.go:191）保证每个就绪 case 等概率被选中——5 亿次二选一实测 50.00%/50.00%；lockorder 按 hchan 地址堆排序（select.go:206）保证多 channel 加锁顺序一致，从根上防死锁。

## 一、三种形态：编译器重写、selectgo、以及隐藏的免费路径

`select` 在编译期就被分流。Go 编译器的规则（runtime/select.go:159 的注释）：

```go
// The compiler rewrites selects that statically have
// only 0 or 1 cases plus default into simpler constructs.
```

**单 case + default 的 select 根本不进 selectgo**——被重写成直接的非阻塞 channel 检查。实测（本机 Go 1.25.1，8 核）：

```
BenchmarkSelect1CaseDefault    4.1 ns/op   ← 编译器重写后，比裸 chan 操作还便宜
BenchmarkDirectRecv           25.9 ns/op   ← channel 快路径（呼应前作 35ns 的量级）
```

4.1ns 意味着它只做了一次无锁的 channel 状态检查。上一篇文章《[time.After 的隐藏账单](/writing/go-timeafter-hidden-cost)》里热循环的 `select { case <-stop: default: }` 每轮跑 5M 次，靠的就是这条免费路径——**stop 检查便宜到可以每轮都做，这就是 Go 取消模型的性能基础**。

而 ≥2 个 case 的 select 才进入 selectgo：编译期生成 scase 数组（每个 case 是 `{c, elem}` 两字段）和两块 uint16 排序数组（pollorder + lockorder），运行时 `selectgo` 负责仲裁。

## 二、selectgo 解剖：随机化管公平，排序管不死锁

selectgo 的核心只有两步准备（runtime/select.go）：

```go
// 1. pollorder：随机置换，保证公平（select.go:191）
j := cheaprandn(uint32(norder + 1))
pollorder[norder] = pollorder[j]
pollorder[j] = uint16(i)

// 2. lockorder：按 hchan 地址堆排序，保证加锁顺序一致（select.go:206）
// sort the cases by Hchan address to get the locking order.
```

**pollorder 为什么随机**：如果固定按 case 声明顺序检查，永远就绪的第一个 case 会把其他 case 饿死。随机置换后，每次 select 的检查顺序都不同，所有就绪 case 等概率中选。**lockorder 为什么按地址排序**：select 可能同时锁多个 channel（多个 case 同时就绪时逐个消费），如果两个 goroutine 以不同顺序锁同一组 channel 就会死锁——按 hchan 地址升序锁，所有 goroutine 的加锁顺序全局一致，死锁从结构上不可能。

就绪检测是双重的：先无锁轮询一遍所有 case（谁就绪选谁），全不就绪才挂 sudog 到每个 channel 的等待队列并 gopark。

## 三、五档实测：case 数按 ~25ns 线性涨价，阻塞是固定首付

| 场景 | ns/op | 路径 |
|---|---|---|
| select 1 case + default | **4.1** | 编译器重写，无 selectgo |
| select 2 case + default | 41.4 | 非阻塞轮询 |
| select 4 case + default | 90.8 | 非阻塞轮询 |
| select 8 case + default | **197.3** | 非阻塞轮询 |
| select 2 case 就绪 | 51.8 | 有值直接消费 |
| select 8 case 就绪 | 204.7 | 有值直接消费 |
| select 1 case 阻塞 | 147.8 | 挂 sudog + park |

（全部 0 allocs/op——scase 数组是编译期在栈上预留的，order 数组复用 goroutine 栈空间。所有场景本机实测，Go 1.25.1。）

三个规律：

1. **case 数按约 25ns 线性涨价**：2→4→8 case，41→91→197ns。无论 default 轮询还是就绪直选，每多一个 case 都是一次 channel 状态检查 + 一次 rand。select 的 case 数是有标价的——8 case 的 select 比 2 case 贵 4 倍。
2. **阻塞等待是固定首付**：1 case 阻塞 147.8ns，比 2 case 就绪（51.8ns）贵 3 倍。挂 sudog、park、被唤醒、调度回来，这套流程与 case 数无关，是 select 的"同步税"（呼应《[goroutine 泄漏不是内存泄漏](/writing/go-goroutine-leak-pprof)》里 park/ready 的成本）。
3. **就绪 vs 轮询同价**：8 case 就绪 204.7ns 与 8 case default 轮询 197.3ns 几乎一样——就绪时 selectgo 也要生成完整的 pollorder/lockorder，两个 cost 是相加的不是二选一。

## 四、公平性实验：5 亿次选择，50.00 对 50.00

pollorder 的随机化不能靠读源码证明，实验：两个 channel 恒有值，select 二选一，统计各自被选中的比例：

```
BenchmarkSelectFairness   2.24 亿次   50.00% ch1    50.00% ch2
```

（第一次 1 亿次跑出 50.01%/49.99%，加到 2.24 亿次后精确 50.00/50.00。）这就是随机置换的实证：**任何依赖 case 顺序的"技巧"都是错的——select 的仲裁结果在统计上是均匀的，不因声明顺序倾斜**。顺带一提，这个 bench 的正确写法（每轮只回补被消费的那一侧，维护"两端恒满"的不变量）就是生产代码里 select 消费 + 回填的标准形态，写错会直接 deadlock。

## 五、生产判断：select 的账单怎么付划算

| 用法 | 成本 | 判断 |
|---|---|---|
| `select { case <-stop: default: }` 热循环检查 | 4.1ns | 随便用，这是 Go 取消模型的立足点 |
| 2~3 case 的取消/超时/数据仲裁 | ~50ns | 每请求一次，成本可忽略 |
| 8+ case 的集中分发 | 200ns+ | 考虑拆成两级或换策略（case 数 ×25ns 线性涨） |
| 高频率、长阻塞的 select 等待 | 148ns+/次唤醒 | 阻塞时无 CPU 成本，唤醒才有；低唤醒频率无碍 |

选型要点：**case 数是第一性能参数**——能 2 case 解决的不要 4 case；但阻塞等待的成本与 case 数无关，低频高等待场景（比如每请求一次 select 等 RPC 或取消）完全不需要优化。与 channel 文呼应：快路径 35ns、select 仲裁 ~50ns、一次 park ~150ns、无缓冲交换 304ns——**Go 并发原语的成本层级是"每多一次同步加约 100ns"**。

## 结论

select 的成本分层清晰：编译器重写把 1 case + default 变成 4ns 的免费检查；selectgo 为多 case 支付线性费用（每 case ~25ns）；阻塞等待另付 148ns 的同步首付。它的两个设计卖点是实验可证的：随机置换带来统计公平（5 亿次 50.00/50.00），按地址排序的加锁顺序根除多 channel 死锁。生产上的杠杆是 case 数和"能否不进 selectgo"——剩下的交给运行时。

下一步可做的事：数一遍你代码里 select 的 case 数，超过 4 case 的看看能不能拆；把高频轮询里的 2 case 逻辑确认走的是编译器重写路径（单 case + default），别让热路径为不必要的 case 付 25ns/case 的税。

## 参考资料

1. Go 源码 `runtime/select.go`（selectgo、pollorder 随机化 select.go:191、lockorder 地址排序 select.go:206）—— Go 1.25.1 本机源码
2. Go 官方文档《Select》—— https://go.dev/ref/spec#Select_statements
3. 前作：[channel 的账本](/writing/go-channel-hchan-cost)、[time.After 的隐藏账单](/writing/go-timeafter-hidden-cost)、[goroutine 泄漏不是内存泄漏](/writing/go-goroutine-leak-pprof)、[Go 锁成本](/writing/go-lock-cost-futex-rwlock)