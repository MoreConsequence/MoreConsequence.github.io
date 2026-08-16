---
title: "goroutine 泄漏不是内存泄漏：一张 goroutine profile 的读法"
description: "内存泄漏排查用 heap 视图，goroutine 泄漏用 goroutine 视图——两把尺子量两种病。本机实测：3 种典型泄漏（chan 发送阻塞、chan 接收阻塞、select 全阻塞）共 3531 个 goroutine，heap profile 显示仅 2MB、差值视图 0%——内存视角完全隐形；goroutine profile 一眼定位到三处卡死点。本文教你 debug=1 原始栈与 -top/-traces 三种读法，以及四种真实生产模式。"
publishedAt: "2026-08-11"
updatedAt: "2026-08-11"
tags: ["Go", "并发", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** goroutine 泄漏和内存泄漏是两种病，用两把不同的尺子：内存泄漏看 `heap` 视图（Alloc 差值），goroutine 泄漏看 `goroutine` 视图（总数 + 分组 + 栈）。本机实测（Go 1.25）：泄漏 3531 个 goroutine 时，heap profile 总量只有 2MB、`-base` 差值视角 0%——**内存视角下 goroutine 泄漏完全隐形**，所以"内存正常"不能排除 goroutine 泄漏。定位一条命令：`go tool pprof -top` 看哪个函数在累积，`-traces`/`debug=1` 看卡死在哪一行。四种真实生产模式：chan 发送阻塞、chan 接收阻塞、select 全阻塞、Ticker/WaitGroup 未释放。

## 一、先纠正直觉：内存没涨 ≠ 没泄漏

上一篇文章（[Go 内存泄漏与 pprof 的账本](/writing/go-memory-leak-pprof)）里，goroutine 只是"三张账"里的一张。这次把它单独拎出来，因为它在实践里被误诊得最狠：**服务内存曲线平稳、GC 正常，但 goroutine 数稳步上涨**，直到某个凌晨 OOM 或文件描述符耗尽。

原因在于 goroutine 的成本结构：一个阻塞的 goroutine 默认栈 8KB，卡在 channel 上几乎不分配新内存。千个 goroutine 也就几十 MB 的量级，在总内存里毫不起眼——heap 视图当然看不到。但每个卡死的 goroutine 背后都是一个**永远不完成的逻辑**：连接没释放、任务没结束、资源没人收。OOM 只是它的晚期症状。

## 二、实验：同一批泄漏，两把尺子量出两种结果

写一个泄漏 demo：三种典型模式轮流泄漏，每 2ms 一个（交替 `leakOnSend` / `leakOnReceive` / `leakOnSelect`）：

```go
var leakSenders = make(chan struct{})   // 永远无人接收
var leakReceivers = make(chan struct{}) // 永远无人发送

func leakOnSend(id int)     { leakSenders <- struct{}{} }  // 卡死在发送
func leakOnReceive(id int)  { <-leakReceivers }             // 卡死在接收
func leakOnSelect(id int) {
	select {
	case <-leakReceivers:
	case <-time.After(time.Hour): // 一小时才到期，期间 pprof 抓得到
	}
}
```

跑 14 秒，goroutine 数从 3 涨到 3531（实测）：

```
goroutines: 3
goroutines: 1265    ← 6 秒时
goroutines: 2579    ← 9 秒时
```

**尺子一：heap 视图（错）**。`/debug/pprof/heap` 两个时刻各抓一次：

```
Showing nodes accounting for 2049.31kB, 100% of 2049.31kB total
      flat   flat%     cum   cum%
   513kB  25.03%   513kB  25.03%  runtime.allocm
  512kB  24.99%   512kB  24.99%  main.leakOnSelect
  512kB  24.99%   512kB  24.99%  time.Sleep
```

总量 2MB。看 `-base` 差值视图更极端：**差值 0**——两个时刻内存占用几乎没变。用内存泄漏的排查套路，结论是"没有泄漏"。错了。

**尺子二：goroutine 视图（对）**。`/debug/pprof/goroutine`：

```
goroutine profile: total 2650
882 @ 0x1042cfea0 ...   #  main.leakOnSend     main.go:17
882 @ 0x1042cfea0 ...   #  main.leakOnReceive  main.go:23
881 @ 0x1042cfea0 ...   #  main.leakOnSelect   main.go:29
1   @ 0x1042cfea0 ...   #  net/http.(*Server).Serve  (正常驻留)
```

三个 882/882/881 的分组，栈尾一行写着卡死的位置：`main.leakOnSend+0x3b main.go:17`。**goroutine profile 是分组报表：同栈的 goroutine 聚合计数，总数 = 泄漏规模，栈 = 泄漏现场**。

## 三、三种读法：-top、-traces、debug=1 各自回答什么

| 命令 | 回答的问题 | 实测输出（同一个 profile） |
|---|---|---|
| `go tool pprof -top goroutine.prof` | 哪个函数名下积累最多 | `gopark 100%`，下钻 `leakOnSend/Receive/Select` 各 33% |
| `go tool pprof -traces goroutine.prof` | 每组 goroutine 的完整调用链 | `gopark → chansend → leakOnSend` 一组 884 个 |
| `curl :6060/debug/pprof/goroutine?debug=1` | 逐组原始栈 + 行号 | `882 @ ...` + `main.go:17` |

`-top` 的用法有一个细节：goroutine profile 的"flat"在 `runtime.gopark` 上（100%），**你要看的是 cum 列的下钻**——`-top` 默认 8 行不够就 `-nodecount`，或直接 `-traces` 看全栈。`debug=1` 适合在线看：不带文件，一行 curl 出分组和行号。

抓取命令（两次采样算增量，和 heap 的做法一样）：

```bash
curl -s localhost:6060/debug/pprof/goroutine > /tmp/g1.prof && sleep 10
curl -s localhost:6060/debug/pprof/goroutine > /tmp/g2.prof
go tool pprof -base /tmp/g1.prof -top /tmp/g2.prof   # 增量：这 10 秒新长的都归谁
```

## 四、四种真实生产模式：怎么读栈，怎么修

goroutine 泄漏的生产模式就那么几类，栈一眼能认：

| 模式 | 栈特征 | 修复方向 |
|---|---|---|
| chan 发送阻塞 | `chansend` → 你的函数 → `ch <- x` 行 | 加超时（`select` + `time.After`）或保证消费方存在 |
| chan 接收阻塞 | `chanrecv` → 你的函数 → `<-ch` 行 | 谁生产谁负责关闭；`context` 取消时退出 |
| select 全阻塞 | `selectgo` → 全是永不触发的 case | 至少一个 case 可取消（`ctx.Done()`） |
| `time.Ticker` 未 Stop | `time.Sleep` / `runtime.timerproc` | 不用的 Ticker 立即 `Stop()`，`time.After` 用 `select` 包 |

判别的关键不是"看到 gopark"，而是**读栈里你自己那一层**：卡在哪个 channel、哪一行，那个 channel 的配对端在哪。修复的本质都是同一句话：**阻塞的 goroutine 必须能被人为结束**——要么有消费者、要么有超时、要么能被 context 取消。

## 五、排查的快速流程（增量对比法）

1. **两次采样算增量**：`curl` 抓 `g1.prof`，等 5-10 秒抓 `g2.prof`，`go tool pprof -base g1.prof -top g2.prof`——只看新长的，忽略常驻（HTTP server、GC 等）；
2. **确认总数在涨**：`debug=1` 第一行 `goroutine profile: total N`，隔几秒再看一次；
3. **`-traces` 找到新增分组的栈**：新分组名 = 泄漏现场，`main.go:17` 就是卡死的行；
4. **按上表对号入座修**：加超时 / 补关闭 / 接 context；
5. **验证**：修完重启，再抓两次，增量应该归零。

常驻 goroutine 是正常噪音（HTTP server 的 `Accept`、pprof 自身、`runtime` 内部），`-base` 增量法自动把它们滤掉——这是为什么一定要用两帧对比，而不是看单帧总数。

## 结论：goroutine 泄漏要用 profile 和可结束性定位

goroutine 泄漏与内存泄漏是两种病，尺子不能混用：内存正常不代表没有 goroutine 泄漏（实测 3531 个泄漏 goroutine 在 heap 差值视图里是 0%）。排查路径固定为"两帧增量 + goroutine 视图"：`-top` 定位分组、`-traces` 读栈、`debug=1` 在线看行号，然后按四种生产模式对号修。写代码时的防线只有一句话：**每个 goroutine 都要能被结束**——消费者、超时、context，至少有一个。

下一步可做的事：拿你线上最可疑的服务，抓两帧 goroutine profile 做增量对比；把生产代码里所有裸 `<-ch`、`ch <- x` 和 `select`（没有 `ctx.Done()` case 的）过一遍，逐处回答"它怎么被结束"。

## 参考资料

1. Go 官方 pprof 文档（goroutine 视图与四种 profile）—— https://pkg.go.dev/runtime/pprof
2. Go 官方调试指南（pprof 一节含 goroutine）—— https://go.dev/doc/diagnostics
3. 前作：[Go 内存泄漏与 pprof 的账本](/writing/go-memory-leak-pprof)、[Go GC 时间账本](/writing/go-gc-gctrace-account)、[Go 调度器的三张表](/writing/go-scheduler-gmp-preemption)
