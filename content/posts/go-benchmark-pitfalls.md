---
title: "benchmark 的七宗罪：死代码消除、逃逸干扰与 512B 的采样谎言"
description: "本系列所有实测数字背后，是七个差点骗过我的坑，全部有真实翻车案例：死代码消除让 bench 跑出 0.79ns（其实是 0 工作）；逃逸干扰让同一行代码 0 allocs 变 48B/2 allocs；alloc_space 采样粒度 512B 直接报假数字；并发 bench 的 b.N/n 整除陷阱；阻塞型操作与 benchtime 的乘法效应。本文给每宗罪的复现特征与检查清单——先学会读自己的数字，再谈优化。"
publishedAt: "2026-08-15"
updatedAt: "2026-08-16"
tags: ["Go", "性能测试", "工具链"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 本系列的每个数字都来自 `testing.B` 实测，而实测最大的敌人不是性能问题，是 bench 自己：**七宗罪**——① 死代码消除（常量输入被编译器整段优化，bench 跑出 0.79ns 的假数字）；② 逃逸干扰（结果存进大数组让转换从 0 allocs 变成 48B/2 allocs）；③ `alloc_space` 采样粒度 512B 谎报字节数；④ 并发 bench 的 `b.N/n` 整除陷阱；⑤ 阻塞型操作 × benchtime 的乘法爆炸；⑥ GOMAXPROCS 改变路径；⑦ 结果不消耗导致循环提升（0 allocs 的假象）。每条都有真实翻车案例和检查清单。

## 一、死代码消除：0.79ns 的"超快"bench

本系列实测中的真实翻车：《[interface 装箱](/writing/go-interface-boxing)》的 `BenchmarkBoxBigStruct` 第一版——把常量 `big{1,2,3,4}` 装进 `any`，结果 **0.79ns、0 allocs**，看起来"装箱免费"。真相：编译器证明输入是常量、结果从未被读取，把整个循环优化没了——**bench 在测空气**。

特征：B/op 异常小、比同类操作快一个量级以上。
检查清单：输入用循环变量（`big{int64(i), 2, 3, 4}`）；结果必须被真实消耗（`runtime.KeepAlive` 或写入从外部不可知的 sink）。

修正后同一 bench：**12.8ns、1 alloc**——这才是真数字。

## 二、逃逸干扰：同一行代码，两种 allocs

《[string ↔ []byte](/writing/go-string-byte-conversion)》里 `m[string(b32)]` 实测 0 allocs；但同一行 `string(b32)` 存进一个 `[64]string` 数组时变成 48B/2 allocs。用 `-gcflags=-m` 一查：`string(b32) escapes to heap`——**我的"防逃逸 sink"本身就是逃逸源**：1024B 的大数组让编译器放弃栈上分配。

特征：同一操作换个 sink 后 allocs 大变。
检查清单：结果是否被读取；sink 尺寸；`-gcflags=-m` 确认逃逸判定；**只引用"不逃逸"路径的结论**（本文的 map 查找数字以 `-m` 输出 + benchmem 双重确认）。

## 三、alloc_space 的 512B 采样谎言

《[time.After 的隐藏账单](/writing/go-timeafter-hidden-cost)》里用 `pprof -sample_index=alloc_space` 抓分配热点，输出显示 `time.newTimer` 每次 **1024kB**——实际 benchmem 精确值是 **248B**。原因：alloc_space 的采样粒度是 512B 对齐，且 sample index 换算放大失真。

特征：pprof 字节数与 benchmem 差一个量级。
检查清单：**采样型 profile 只用于定位热点，不用来报数字**；精确值一律 `-benchmem`；发现矛盾先怀疑采样粒度（512B），别怀疑代码。

## 四、并发 bench 的整除陷阱

本系列所有并发 bench 都写 `per := b.N / n`——**b.N 不保证整除 n**，剩余循环被丢弃，且 n 个 goroutine 的启动/退出成本混进计时。更隐蔽的版本：goroutine 间依赖错误（《[channel 的账本](/writing/go-channel-hchan-cost)》里"只补被消费的那侧"的不变量，写错直接 deadlock 崩掉 bench）。

特征：并发数字忽高忽低；bench 偶发 deadlock。
检查清单：并发 bench 总工作量 = n × per，接受余数丢弃的微小误差；先单线程跑通逻辑，再加并发；用 `-cpu` 参数验证可复现性。

## 五、阻塞操作 × benchtime 的乘法爆炸

《[select 仲裁](/writing/go-select-selectgo-cost)》的 `BenchmarkSelect2CaseReady` 第一版：select 里 `time.After(1ms)`——每 op 阻塞 1ms，`-benchtime=10000x` 跑了 **12.9 秒**（而不是 0.01 秒）。testing 框架的 `-benchtime=Nx` 按迭代数算，不会因为你的 op 慢而减少——阻塞型 bench 的时间会线性爆炸。

特征：bench 实际耗时 ≈ 单 op 阻塞时长 × N。
检查清单：阻塞型操作用时间基准（`-benchtime=2s` 而非 `Nx`）；知道你的 op 里有没有隐式等待（select、chan、锁竞争）。

## 六、GOMAXPROCS 改变路径

《[channel 的容量边界](/writing/go-channel-hchan-cost)》当前保存的是“独立 drain 下的 send-only 容量对照”，不是无缓冲 ping-pong；因此不能把那组 `34.91–139.0ns` 直接解释成 goroutine 交接或跨 P 唤醒成本。若要研究 `GOMAXPROCS` 的影响，必须固定为同一个 ping-pong workload，同时跑 `-cpu=1,8`，并保存该 workload 自己的 raw；不能拿 send-only、ping-pong 和 Mutex 争用三种语义拼成一张表。

特征：同样的代码，不同机器核数数字差 20%+。
检查清单：结论与核数相关时同时跑 `-cpu=1,8`；引用数字时注明 GOMAXPROCS（本系列所有数字都标注"arm64 8 核"）。

## 七、循环提升：0 allocs 的假象

《[interface 装箱](/writing/go-interface-boxing)》的 `BenchmarkBoxInt`：8B/op 但 **0 allocs**——编译器把装箱分配提升到循环外（每次循环只写同一个槽位），alloc 消失但语义上"每次仍在装箱"。0 allocs 不代表零成本。

特征：B/op > 0 但 allocs = 0；或常量路径 0/0。
检查清单：0 allocs 也要看 B/op 和 ns/op；怀疑提升时用 `-gcflags=-m` 看 allocation 决策；**benchmem 的三个数（ns/B/allocs）要一起读，单个数单独会骗人**。

## 结论：先学会读自己的数字

七宗罪的共同根源是**编译器比你以为的聪明，采样器比你以为的粗**。检查清单汇总：输入用变量、结果必消耗（罪 1、7）；sink 别太大、逃逸用 -m 确认（罪 2）；采样 profile 只定位不报数（罪 3）；并发先跑通再算量（罪 4）；阻塞用时间基准（罪 5）；跨核结论标核数（罪 6）。跨文章复用数字时，真正的第一道门不是“同量级”，而是相同操作、输入、`-cpu`、Go 版本和 raw 路径都能对上；不同语义的数字即使接近，也不能拼成趋势。

下一步可做的事：把你仓库里的测试 bench 逐条过一遍这份清单；特别关注所有 `b.N` 循环里没有 KeepAlive 的——那是最常见的死代码消除温床。

## 参考资料

1. Go 官方《testing 包性能测试文档》—— https://pkg.go.dev/testing#hdr-Benchmarks
2. Go 官方《pprof 文档》与 `-sample_index` 说明—— https://pkg.go.dev/runtime/pprof
3. 前作：[string ↔ []byte](/writing/go-string-byte-conversion)、[interface 装箱](/writing/go-interface-boxing)（本文案例出处）
