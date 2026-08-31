---
title: "channel 的容量边界：同一条 send 从 34.91ns 走到 139.0ns"
description: "一次本机 Go 1.25.1/arm64 基线测量同一条 send 路径，由独立 goroutine drain：cap=256 为 34.91ns，cap=16 为 40.33ns，cap=1 为 104.8ns，无缓冲为 139.0ns；8 个并发 sender 共享 cap=256 为 78.25ns。文章从 hchan、buffer 与 sudog 路径解释容量改变的同步语义，不拿 send-only 数字冒充阻塞往返或 Mutex 对照。"
publishedAt: "2026-08-12"
updatedAt: "2026-08-17"
tags: ["Go", "并发", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** channel 的成本首先由容量和是否需要交接决定。本次统一基准只测同一条 `send` 路径，由一个独立 goroutine 持续 drain，避免把 send、recv 和 ping-pong 混成一个数字：`cap=256` 为 **34.91ns/op**，`cap=16` 为 **40.33ns/op**，`cap=1` 为 **104.8ns/op**，无缓冲为 **139.0ns/op**；8 个并发 sender 共享 `cap=256` 为 **78.25ns/op**。hchan 的 `lock`、环形 buffer、sendq/recvq 和元素拷贝解释了这些路径，但这组数字只代表当前机器、输入类型和 benchmark 形状，不证明 channel 永远比 Mutex 快。


---

![Go Channel 底层结构 (hchan)、环形缓冲区与 waitq 等待队列](../../../public/images/go-channel-hchan-lock-ring-waitq.svg)

## 一、hchan 解剖：一把锁、两个队列、一个环形 buffer

`channel` 的运行时结构在 `runtime/chan.go`（Go 1.25.1）。下面只保留决定本文路径的关键字段；完整实现仍应以目标 Go 版本源码为准：

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
2. **元素可能发生值拷贝**。send 把元素拷进 buf（或直传 sudog），recv 再拷出来；元素类型和路径决定实际拷贝量。本文只测 `int`，不把未采集的“大元素 +7ns”写成当前结论。
3. **队列里挂的是 sudog**（goroutine 的等待票据），不是数据。阻塞的 goroutine 以 sudog 形式挂在 recvq/sendq 上，等待被唤醒。

## 二、四档容量实测：从 34.91ns 到 139.0ns

本机（Go 1.25.1、Darwin arm64、`-cpu=8`）用同一个 `testing.B` 实测，元素为 `int`。每个子基准启动一个 drain goroutine；表中 `ns/op` 是发送端每次 `ch <- i` 的耗时，不是 send+recv 往返：

| 场景 | ns/op | B/op | 路径 |
|---|---|---|---|
| 有缓冲 `cap=256`，1 sender + 1 drain | **34.91** | 0 | buffer 有空间时的快路径 |
| 有缓冲 `cap=16`，1 sender + 1 drain | 40.33 | 0 | 大多数时间仍在 buffer 快路径 |
| 有缓冲 `cap=1`，1 sender + 1 drain | 104.8 | 0 | sender 与 drain 更频繁交接 |
| 无缓冲，1 sender + 1 drain | **139.0** | 0 | 每次 send 都需要接收方配合 |
| 有缓冲 `cap=256`，8 个并发 sender | 78.25 | 0 | 多 sender 争用同一条 channel |

（所有场景 `0 allocs/op`；这不等于生产系统没有其他分配，也不等于所有阻塞/关闭路径都不分配。）

读法：

- **34.91ns 是本次 buffer 快路径的基线**：buffer 有空间时，send 主要做锁、索引和元素写入；它不是 channel 操作的固定常数。
- **cap=1 把交接频率推高**：同一 drain 形状下，`cap=1` 是 104.8ns，`cap=16` 是 40.33ns。容量买的是生产者与消费者之间的暂时不同步，不是“越大越快”的无限券。
- **无缓冲的 139.0ns 只说明发送端需要接收方配合**：它仍然不是旧文章中的 ping-pong 往返数字。若要测往返，必须单独实现 send→recv→ack 并保存独立 raw 输出。
- **并发 sender 的 78.25ns 是争用证据**：相对单 sender `cap=256` 的 34.91ns 变慢，说明一条 channel 的共享锁与调度竞争不能被单 goroutine 基准隐藏。

## 三、快慢路径的分界线：会不会 park

源码里 `chansend` 的第一条注释明确区分了非阻塞探测与真正发送路径（Go 1.25.1 的 `runtime/chan.go`）：

```go
// Fast path: check for failed non-blocking operation without acquiring the lock.
```

无锁的快速探测只服务 `select` 的 default 分支（上一篇文章《[time.After 的隐藏账单](/writing/go-timeafter-hidden-cost)》里的热循环就是靠它走到 default 的）。真正决定成本的是阻塞路径：

```
send 快路径（缓冲有空位）：lock → 写 buf → unlock
send 慢路径（缓冲满）：lock → 挂 sudog 进 sendq → park → 被 ready → 调度回来
```

这里的数字只是路径示意，不是本次表格的额外测量：当前 benchmark 测的是一个持续 drain 的发送端，不保证每轮都进入“buffer 满”的路径。无缓冲 channel 是“直传”变体：发送方没有 buffer 可写，必须与接收方建立交接；如果要讨论 park/ready 的成本，应使用独立的阻塞或 ping-pong 实验。

因此不能用本表和“Mutex 保护计数器”做速度排名：两者没有相同的工作量。channel 同时提供排队、所有权转移和阻塞；Mutex 只提供互斥，数据结构与等待条件还要由调用方实现。要做公平比较，必须固定临界区、队列深度、消费者数量和成功/阻塞判定。



![Channel 跨栈内存直传时序：sendDirect 与 goready 唤醒流转](../../../public/images/channel-direct-stack-copy-send-flow.svg)

## 四、竞争场景：共享 channel 会把快路径拉长

统一入口额外使用 `b.RunParallel` 让 8 个 sender 共享 `cap=256` channel，结果是：

| 场景 | ns/op | 说明 |
|---|---|---|
| 1 sender + 1 drain，`cap=256` | **34.91** | 单一发送者，主要走 buffer 快路径 |
| 8 sender + 1 drain，`cap=256` | **78.25** | sender 之间共享 channel 状态 |

这组结果只证明共享状态带来额外成本，不证明“channel 竞争一定更快/更慢”。如果消息本身需要排队、传递所有权，channel 的语义可能省掉额外协调；如果只是更新一个计数器，channel 反而是过度设计。元素大小、消费者速度和关闭流程都应作为独立变量测量。

## 五、生产判断：什么时候用哪一档

| 需求 | 选型 | 为什么 |
|---|---|---|
| 事件通知、任务分发（低频） | 无缓冲 channel | 语义最强：发送方确认接收方已接管 |
| 生产者-消费者流水线（高频） | 有缓冲，容量由队列目标决定 | 吸收节奏抖动；本次 `cap=16` 与 `cap=256` 分别为 40.33ns 与 34.91ns |
| 多消费者负载分担 | 有缓冲 + 多个 recv 方 | 单 chan 单锁，但快路径足够便宜 |
| 高频薄数据（计数、令牌） | 原子操作 / Mutex | channel 的同步语义是过度设计 |
| 超大元素传输 | 传指针，数据放共享结构 | 拷贝成本随元素大小线性涨 |

缓冲容量不能只由 ns/op 决定。当前形状中 `cap=1` 到 `cap=16` 从 104.8ns 降到 40.33ns，`cap=16` 到 `cap=256` 只从 40.33ns 降到 34.91ns；更大的 buffer 也会提高允许积压的上限。容量决策应同时给出队列长度、消息大小、消费者最慢处理时间、允许延迟和满队列时的背压动作。

## 六、结论：channel 容量是背压合同，不是固定性能常数

当前同一发送语义下，`cap=256` 是 **34.91ns/op**，`cap=16` 是 **40.33ns/op**，`cap=1` 是 **104.8ns/op**，无缓冲是 **139.0ns/op**；8 个 sender 共享 `cap=256` 则是 **78.25ns/op**。这些数字支持的不是“选 256”，而是一个更稳的判断：**容量在同步边界上买的是暂时不同步；一旦 sender 数量、消费者速度或消息大小变化，性能与积压合同也会变化。**

下一步可做的事：为每条生产者-消费者链记录容量、消息大小、消费耗时和满队列动作；再用当前实验入口分别测单 sender、并发 sender、慢消费者和关闭路径。不要把 send-only 基准写成端到端吞吐，更不要用它替代真实队列延迟。

## 参考资料

1. Go 源码 `runtime/chan.go`（hchan 结构、chansend/chanrecv 快慢路径）—— Go 1.25.1 本机源码
2. Go 官方文档《Channels》与《Effective Go》channel 章节—— https://go.dev/doc/effective_go
3. 前作：[Go 锁成本](/writing/go-lock-cost-futex-rwlock)、[goroutine 泄漏不是内存泄漏](/writing/go-goroutine-leak-pprof)、[time.After 的隐藏账单](/writing/go-timeafter-hidden-cost)
4. 本文实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkChannelSend`、`BenchmarkChannelParallelSend`）；环境与原始输出：`evidence/go-runtime-boundary/2026-08-16-local/`。
