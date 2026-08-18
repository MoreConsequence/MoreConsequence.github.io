# Go 调度 benchmark：本机证据

## 命令

```bash
cd experiments
go test ./go-scheduler-boundary -run '^$' -bench '^(BenchmarkGoroutineCreate|BenchmarkChannelPingPong)$' -benchmem -benchtime=500ms -count=1 -cpu=8
```

benchmark 分别测 goroutine 创建/回收和一个无缓冲 channel 的双 goroutine 传递。两者都不是 HTTP、网络或完整上下文切换 benchmark。

## 结论边界

本机一次运行得到 310.7ns 与 130.1ns；这些数字绑定 Go 1.25.1、Darwin arm64、Apple M1 Pro、`-cpu=8`、500ms benchtime 和当前 benchmark 代码。`forcePreemptNS=10ms` 是 runtime 源码阈值，不是 p99 或最坏等待合同；调度现场还需要 trace、schedtrace、block/mutex profile 和尾延迟。
