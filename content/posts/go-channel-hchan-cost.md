---
title: "channel 的账本：快路径 35ns，慢路径 304ns"
description: "channel 的每次操作成本差异有 9 倍：有缓冲快路径每 op 35ns，无缓冲 ping-pong 每次来回 304ns。本机实测（Go 1.25.1，8 核）：cap=256 的 1P1C 吞吐 57M ops/s，8 生产者 8 消费者竞争下 23M ops/s——同场景 Mutex 8 线程 107ns/op。解剖 hchan：一把锁、两个 sudog 队列、元素直拷。"
publishedAt: "2026-08-12"
updatedAt: "2026-08-12"
tags: ["Go", "并发", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** channel 的一次操作成本不是常数，快慢两条路径差 9 倍：有缓冲且不阻塞时每次 send/recv 只要锁一把 + 拷元素（实测 1P1C 每 op 35ns，57M ops/s）；无缓冲时每次同步要挂 sudog、park/ready 两个 goroutine（ping-pong 实测每次来回 304ns）。hchan 的结构就是答案：一把 `lock mutex` 保护一切，外加一个环形 buffer 和两个 waitq（sudog 队列）。8 生产者 8 消费者竞争共享 channel 实测 43ns/op（23M ops/s），同场景 Mutex 8 线程 107ns/op（与前作实测 118ns 同量级）——竞争场景下 channel 的搬运成本并不比锁贵。选型规则：同步语义用无缓冲，流水线节流用有缓冲，超高频薄数据考虑原子/无锁。

## 一、hchan 解剖：一把锁、两个队列、一个环形 buffer

`channel` 的运行时结构在 `runtime/chan.go`（Go 1.25.1），全文不到一百行的核心：

```go
type hchan struct {
	qcount   uint           // buffer 中现有元素数
	dataqsiz uint           // buffer 容量
	buf      unsafe.Pointer // 环形 buffer
	elemsize uint16
	closed   uint32
	elemtype *_type         // 元素类型（决定拷贝字节数）
	sendx    uint           // 环形写指针
	recvx    uint           // 环形读指针
	recvq    waitq          // 等待接收的 goroutine 队列（sudog 链表）
	sendq    waitq          // 等待发送的 goroutine 队列
	lock     mutex          // 保护上面所有字段的锁
}
```

三个要点决定它的性能画像：

1. **一把锁保护一切**。qcount/buf/sendx/recvx 的读写、队列的进出，全部在 `lock` 临界区内。channel 的吞吐上限 = 锁竞争上限。
2. **元素是值拷贝**。send 把元素拷进 buf（或直传 sudog），recv 拷出来。元素越大，单次成本越高（实测 128B 元素比 int 慢约 7ns/op）。这决定了 channel 适合传小值/指针，不适合搬大结构。
3. **队列里挂的是 sudog**（goroutine 的等待票据），不是数据。阻塞的 goroutine 以 sudog 形式挂在 recvq/sendq 上，等待被唤醒。

## 二、五档实测：从 35ns 到 304ns

本机（Go 1.25.1，M 系列 8 核）用 `testing.B` 实测，元素为 int：

| 场景 | ns/op | 吞吐 | 路径 |
|---|---|---|---|
| 有缓冲 cap=256，1 生产者 1 消费者 | **35.1** | 57M ops/s | 快路径：锁 + 拷贝，无 park |
| 有缓冲 cap=16，1P1C | 41.6 | 48M ops/s | 快路径 |
| 8 生产者 8 消费者共享 cap=256 | 43.2 | 23M ops/s | 锁竞争下的快路径 |
| 有缓冲 cap=1，1P1C | 112.2 | 18M ops/s | 每轮至少一端 park |
| 无缓冲 ping-pong（GOMAXPROCS=8） | **304.1** | 6.6M ops/s | 慢路径：双 park + 双 ready |
| 无缓冲 ping-pong（GOMAXPROCS=1） | 247.2 | 8.1M ops/s | 慢路径，同 P 无跨核调度 |

（op 定义：send 或 recv 单侧一次；1P1C 场景一次 send+recv 流水算 2 ops。所有场景 0 allocs/op——sudog 由运行时池复用。）

读法：

- **35ns 是快路径地板**：buffer 有空间/有数据，send/recv 不进队列不 park，成本 = 锁 + 指针读写 + 8 字节拷贝。
- **112ns 是 cap=1 的代价**：生产者和消费者交替独占，每轮至少一个 goroutine 走 park/ready 全流程——对比 cap=16 的 41.6ns，缓冲区只多 15 个槽，吞吐翻 2.7 倍。**缓冲容量的本质是"允许两端短暂不同步"，一次不同步就省一次 park。**
- **304ns 是无缓冲的完整账单**：每次来回 = 发送方 park + 接收方 ready + 反向再来一次，外加 goroutine 调度。GOMAXPROCS=1 时降到 247ns——差的 57ns 就是跨 P 唤醒的调度延迟。

## 三、快慢路径的分界线：会不会 park

源码里 `chansend` 的第一条注释是（chan.go:190）：

```go
// Fast path: check for failed non-blocking operation without acquiring the lock. (chan.go:197)
```

无锁的快速探测只服务 `select` 的 default 分支（上一篇文章《[time.After 的隐藏账单](/writing/go-timeafter-hidden-cost)》里的热循环就是靠它走到 default 的）。真正决定成本的是阻塞路径：

```
send 快路径（缓冲有空位）：lock → 写 buf → unlock      ≈ 35ns
send 慢路径（缓冲满）：lock → 挂 sudog 进 sendq → park → 被 ready → 调度回来 ≈ 100ns+
```

无缓冲 channel 永远走慢路径的"直传"变体：接收方先 park 在 recvq，发送方 lock 后不走 buf，直接把元素写进等待者的 sudog、ready 它——两个 goroutine 必须轮流 park/ready 才能完成一次交换，这就是 304ns 的构成：**每次交换是两次完整的 goroutine 生命周期切换**。

对比上一篇文章《[Go 锁成本](/writing/go-lock-cost-futex-rwlock)》实测的 Mutex：8 线程竞争 118ns/op。channel 在 8 线程竞争下的搬运成本（43ns）反而低于 Mutex——因为 channel 的临界区只做指针操作和拷贝，而 Mutex 竞争有 cacheline 弹跳和自旋。但这不构成"channel 更快"的结论：语义不同（队列搬运 vs 互斥临界区），且 channel 自带一次值拷贝。

## 四、竞争场景：channel 与 Mutex 的同场对照

同一机器同一时段，8 线程：

| 场景 | ns/op | 说明 |
|---|---|---|
| 8P8C 共享 cap=256 channel | 43.2 | 8 生产者并发 send + 8 消费者并发 recv |
| 8 线程 Mutex 保护计数器 | 107.4 | 本机实测，与前作 118ns 同量级 |

channel 的 43ns 略胜，原因有三：单锁临界区极短（无 syscall）、生产者之间数据无竞争（各自写不同槽位）、sudog 池零分配。但这不等于"该用 channel 换掉 Mutex"——现实中选择这两者不是比速度，而是比语义：**channel 卖的是"同步 + 传递"的组合（一次操作同时完成两个目标），Mutex 卖的是"互斥"，传递数据还得自己加一个结构**。用 channel 传高频薄数据（int、指针、token）是划算的；把 8 字节之外的大对象塞进 channel，拷贝成本（实测 128B 元素 +7ns）会随元素大小线性上涨。

## 五、生产判断：什么时候用哪一档

| 需求 | 选型 | 为什么 |
|---|---|---|
| 事件通知、任务分发（低频） | 无缓冲 channel | 语义最强：发送方确认接收方已接管 |
| 生产者-消费者流水线（高频） | 有缓冲 cap=16~256 | 吸收节奏抖动，躲开 park 路径（35 vs 112+ns） |
| 多消费者负载分担 | 有缓冲 + 多个 recv 方 | 单 chan 单锁，但快路径足够便宜 |
| 高频薄数据（计数、令牌） | 原子操作 / Mutex | channel 的同步语义是过度设计 |
| 超大元素传输 | 传指针，数据放共享结构 | 拷贝成本随元素大小线性涨 |

缓冲容量怎么定没有公式，两个经验值：**吞吐从 cap=1 到 cap=16 翻 2.7 倍，之后增益递减**（41.6 → 35.1ns）；cap 越大，消费者空闲时积累的时延越大——它买的不是吞吐，是"两端节奏解耦"。

## 结论

channel 的成本由快慢路径决定：快路径（有缓冲、不 park）35ns/op，慢路径（无缓冲同步）304ns/次来回——差 9 倍，分界线就是"要不要 park 一个 goroutine"。hchan 的解剖解释了全部：一把锁、两个 sudog 队列、一个环形 buffer，元素值拷贝。竞争场景它不比 Mutex 贵（43 vs 107ns，同场实测），选型不必被性能恐惧绑架，但要把容量当性能参数对待：cap=1 是 18M ops/s，cap=16 是 48M ops/s。

下一步可做的事：把你的流水线 channel 容量过一遍，凡 cap=1 的追问一句"两端真的必须严格交替吗"；把高频传递的大结构改成传指针，用 `-benchmem` 验证拷贝税。

## 参考资料

1. Go 源码 `runtime/chan.go`（hchan 结构、chansend/chanrecv 快慢路径）—— Go 1.25.1 本机源码
2. Go 官方文档《Channels》与《Effective Go》channel 章节—— https://go.dev/doc/effective_go
3. 前作：[Go 锁成本](/writing/go-lock-cost-futex-rwlock)、[goroutine 泄漏不是内存泄漏](/writing/go-goroutine-leak-pprof)、[time.After 的隐藏账单](/writing/go-timeafter-hidden-cost)