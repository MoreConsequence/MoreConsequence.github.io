# Go heap/goroutine 两帧 probe：本机证据

## 命令

```bash
cd experiments
go run ./go-memory-leak-pprof --chunks 32 --chunk-bytes 65536 --stuck 100
```

程序先在 GC 后读取 `HeapAlloc`、`HeapObjects` 和 `NumGoroutine`，再保留 32 个 64KiB 缓冲，并启动 100 个阻塞接收 goroutine，所有 goroutine 进入等待后读取第二帧。

## 结论边界

输入缓冲总量是 2097152 字节，goroutine 增量是 100；`heap_delta` 包含运行时和对象元数据，不能当成固定 overhead。该 probe 证明受控输入能在同一进程的两帧指标中留下差异，不证明 pprof 采样对所有对象无损，也不证明生产服务的 RSS、文件描述符、连接或外部队列会按相同比例增长。
