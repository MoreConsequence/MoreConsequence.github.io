---
title: "benchmark 的七宗罪：死代码、逃逸与采样 profile 的错觉"
description: "性能 benchmark 最容易错的不是小数点，而是被测工作本身：编译器可能消掉无效循环，sink 会改变逃逸，pprof 的采样估计不能替代 B/op，并发 b.N 分配与阻塞 benchtime 也会改变实验语义。本文把七类翻车模式改写成可执行的检查清单，并绑定当前 Go benchmark 的命令边界。"
publishedAt: "2026-08-15"
updatedAt: "2026-08-17"
tags: ["Go", "性能测试", "工具链"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** benchmark 的第一道质量门不是“数字看起来合理”，而是确认你测到的工作确实发生了：**七宗罪**——① 死代码消除；② sink 改变逃逸；③ `alloc_space` 是采样估计，不是单次 `B/op`；④ 并发 bench 错分 `b.N`；⑤ 阻塞操作与 `-benchtime=Nx` 相乘；⑥ `GOMAXPROCS` 改变调度路径；⑦ 结果不消费导致循环提升。当前 checkout 的 Go 实验统一绑定 Go 版本、输入、`-cpu`、`-benchmem` 和 raw；没有保存的历史样张不继续当作当前数字。

## 一、死代码消除：越快越要先证明工作发生

编译器可以证明循环结果不会影响可观察状态时，整个循环、常量构造甚至调用都可能被删掉。于是一个“0 alloc、不到 1ns”的 benchmark 可能只是在测循环控制，不能拿来说明装箱、转换或函数调用免费。

当前仓库的有效对照是 `experiments/go-runtime-boundary/bench_test.go` 中的 `BenchmarkInterfaceBoxInt` 与 `BenchmarkInterfaceBoxBigValue`：输入随 `i` 变化，结果写入包级 `anySink`，并通过 `-benchmem` 观察分配。文章不再保留旧 checkout 中没有 raw 的 `BenchmarkBoxBigStruct`、0.79ns 或修正后 12.8ns 样张。

检查清单：输入使用循环变量；结果通过返回值、包级 sink 或 `runtime.KeepAlive` 形成可观察使用；运行 `-gcflags=-m` 看编译器的逃逸/内联判断；再用不同输入确认数字没有只对常量路径成立。

## 二、逃逸干扰：同一行代码，两种 allocs

同一条转换表达式，放进不同 sink，逃逸分析可能给出不同结果：局部使用可以留在栈上，存入长期存活的容器、返回接口或交给未知调用方则可能转到堆。不要把某个 map、数组或包级 sink 的 `B/op` 当成表达式本身的固定成本。

特征：同一操作换个 sink 后 allocs 大变。
检查清单：结果是否被读取；sink 的生命周期和尺寸；`-gcflags=-m` 确认逃逸判定；让对照只改变 sink，不要同时改变输入、调用边界和循环结构。文章引用数字时必须绑定具体路径，不能把“不逃逸”路径外推到返回接口或长期容器的路径。

## 三、alloc_space 的估计量不能冒充 B/op

`go tool pprof -sample_index=alloc_space` 适合回答“累计分配主要从哪条调用路径来”，不适合回答“每次调用精确分配多少字节”。Go 的 `runtime.MemProfileRate` 是平均采样间隔，默认约为 **512 KiB** 的累计分配，不是 512B 的固定对齐粒度；profile 会根据采样结果估计调用点的累计空间，因此可能与 `testing.B` 的 `B/op` 相差很大。

两者回答不同问题：`-benchmem` 在固定 benchmark 形状下报告每次操作的分配统计，heap profile 则是在运行期以采样方式定位累计分配或存活空间。一个 profile 样本显示某个函数很热，不足以推出一次调用的对象大小，更不能从单帧推出泄漏。

检查清单：**采样型 profile 只用于定位热点，不用来报精确单次数字**；精确对照使用同一输入的 `-benchmem`；记录 `MemProfileRate`、采样持续时间和 `sample_index`；发现矛盾先检查采样设置、输入规模和统计口径，而不是凭“512B 粒度”解释。

## 四、并发 bench 的整除陷阱

本系列所有并发 bench 都写 `per := b.N / n`——**b.N 不保证整除 n**，剩余循环被丢弃，且 n 个 goroutine 的启动/退出成本混进计时。更隐蔽的版本：goroutine 间依赖错误（《[channel 的账本](/writing/go-channel-hchan-cost)》里"只补被消费的那侧"的不变量，写错直接 deadlock 崩掉 bench）。

特征：并发数字忽高忽低；bench 偶发 deadlock。
检查清单：并发 bench 总工作量 = n × per，接受余数丢弃的微小误差；先单线程跑通逻辑，再加并发；用 `-cpu` 参数验证可复现性。

## 五、阻塞操作 × benchtime 的乘法爆炸

如果一个 benchmark 每次操作都可能等待 1ms，再用 `-benchtime=10000x`，框架会执行约 10,000 次迭代；总时间至少受等待次数约束，而不会因为操作变慢自动减少 `N`。`-benchtime=2s` 与 `-benchtime=10000x` 的语义不同：前者以墙钟时间控制迭代量，后者以固定迭代数控制运行量。

特征：bench 实际耗时 ≈ 单 op 阻塞时长 × N。
检查清单：阻塞型操作优先用时间基准（例如 `-benchtime=2s`），并记录每次操作是否包含 select、channel、锁或网络等待；若必须用 `Nx`，先估算最坏运行时间并给 benchmark 设置外部超时。

## 六、GOMAXPROCS 改变路径

《[channel 的容量边界](/writing/go-channel-hchan-cost)》当前保存的是“独立 drain 下的 send-only 容量对照”，不是无缓冲 ping-pong；因此不能把那组 `34.91–139.0ns` 直接解释成 goroutine 交接或跨 P 唤醒成本。若要研究 `GOMAXPROCS` 的影响，必须固定为同一个 ping-pong workload，同时跑 `-cpu=1,8`，并保存该 workload 自己的 raw；不能拿 send-only、ping-pong 和 Mutex 争用三种语义拼成一张表。

特征：同样的代码，不同机器核数数字差 20%+。
检查清单：结论与核数相关时同时跑 `-cpu=1,8`；引用数字时注明 GOMAXPROCS（本系列所有数字都标注"arm64 8 核"）。

## 七、循环提升：0 allocs 的假象

《[interface 装箱](/writing/go-interface-boxing)》的 `BenchmarkInterfaceBoxInt`：8B/op 但 **0 allocs**——接口值本身仍然有写入成本，`allocs/op` 为零也不等于整个操作零成本。是否发生堆分配还要结合对象形状、sink 和逃逸分析判断。

特征：B/op > 0 但 allocs = 0；或常量路径 0/0。
检查清单：0 allocs 也要看 B/op 和 ns/op；怀疑提升时用 `-gcflags=-m` 看 allocation 决策；**benchmem 的三个数（ns/B/allocs）要一起读，单个数单独会骗人**。

## 八、结论：先学会读自己的数字

七宗罪的共同根源是**编译器比你以为的聪明，采样器比你以为的粗**。检查清单汇总：输入用变量、结果必消耗（罪 1、7）；sink 别太大、逃逸用 -m 确认（罪 2）；采样 profile 只定位不报数（罪 3）；并发先跑通再算量（罪 4）；阻塞用时间基准（罪 5）；跨核结论标核数（罪 6）。跨文章复用数字时，真正的第一道门不是“同量级”，而是相同操作、输入、`-cpu`、Go 版本和 raw 路径都能对上；不同语义的数字即使接近，也不能拼成趋势。

下一步可做的事：把你仓库里的测试 bench 逐条过一遍这份清单；特别关注所有 `b.N` 循环里没有 KeepAlive 的——那是最常见的死代码消除温床。

## 参考资料

1. Go 官方《testing 包性能测试文档》—— https://pkg.go.dev/testing#hdr-Benchmarks
2. Go 官方 `runtime.MemProfileRate` 文档—— https://pkg.go.dev/runtime#MemProfileRate
3. Go 官方《pprof 文档》与 `-sample_index` 说明—— https://pkg.go.dev/runtime/pprof
4. 前作：[string ↔ []byte](/writing/go-string-byte-conversion)、[interface 装箱](/writing/go-interface-boxing)（本文案例出处）

实验入口：`experiments/go-runtime-boundary/bench_test.go`；统一命令和当前 raw 见 `evidence/go-runtime-boundary/2026-08-16-local/`。本文没有为旧版的失败样张保留独立 raw，因此不再把那些历史数字写成当前基线。
