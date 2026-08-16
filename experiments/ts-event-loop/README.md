# Event-loop / goroutine 对照实验

这些程序回答的是不同问题，不能把 `time.Sleep` 和同步 busy loop 当成同一种“阻塞”：

直接运行 TypeScript 源文件需要 Node 22.13.0 以上；本文的本机记录使用 Node 24.19.0。先确认 `node --version`，再运行下面的命令。

```bash
node blocking2.ts       # Node 主线程同步 CPU 工作，timer lateness
node order.ts            # 观察 5 轮 microtask 与顶层 timer/immediate 顺序
go run go-sleep.go       # GOMAXPROCS=1 时，sleeping goroutine 不阻止另一个 goroutine
```

每次运行只代表当前机器、Node/Go 版本和系统负载下的一次观察。要比较 CPU 并行度，应另写同语义的 Go CPU loop 与 Node `worker_threads` 实验，不能用本目录的 sleep 结果替代它。
