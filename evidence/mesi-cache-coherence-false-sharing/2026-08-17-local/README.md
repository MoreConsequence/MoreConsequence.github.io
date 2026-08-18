# MESI/伪共享局部实验

## 运行入口

```bash
cd experiments/mesi-false-sharing
go run main.go
```

程序使用两个 goroutine、`GOMAXPROCS=2`、每个计数器 2,000,000 次 `atomic.AddInt64`，先做 1 次 warmup，再做 7 次测量并报告中位数。`packed` 把两个 `int64` 放在 offset 0/8；`padded` 把第二个计数器放到 offset 64。程序会打印布局，因此读者可以先确认本次运行确实使用了 64B 间距。

## 本次观察

在本机这次运行中，packed 为 78,632,084 ns，padded 为 18,277,333 ns，二者比值为 4.30x。这个比值只属于当前机器、调度、两线程布局、原子操作、输入规模和一次运行窗口；它不是 MESI 的固定税率，也不能外推到所有 CPU、核绑定方式、线程数或非原子普通写。

实验采用 `atomic.AddInt64` 是为了让两个 goroutine 的计数更新具有明确的并发语义；原子操作本身也会影响成本，因此这不是“纯粹的协议延迟”测量。它只能说明同一缓存行上的写竞争可能显著改变一个具体 workload 的耗时。

## 未覆盖

- 没有使用 `perf`/PMU 计数器，也没有证明某个 cache-miss 数量；当前运行环境是 Darwin arm64。
- 没有绑定两个 goroutine 到不同物理核，没有控制频率、温度、NUMA 或后台负载。
- `padded` 的 64B 假设是本实验布局，不代表所有架构的 cache line 大小；生产结构应结合目标架构和实际 profile 决定。
- 没有把这个数字外推成“加 padding 必然更快”；真实共享、读多写少、结构体体积和局部性可能让 padding 变成额外内存成本。
