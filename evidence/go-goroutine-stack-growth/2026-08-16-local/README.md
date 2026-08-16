# go-goroutine-stack-growth evidence

这是一组 Go 1.25.1、Darwin arm64、Apple M1 Pro 上的一次本机 evidence snapshot，基线为 dirty checkout `HEAD=9dde22f`。

## Commands

从仓库根目录运行：

```bash
cd experiments
go test ./go-runtime-boundary -run '^$' -bench '^BenchmarkGoroutineCreateJoin$' -benchmem -benchtime=1s -cpu=8
go run ./go-runtime-boundary/cmd/stack-growth -depths=1000,100000,1000000 -repeats=5
```

`BenchmarkGoroutineCreateJoin` 在循环中复用一个 `WaitGroup`，测的是发射 goroutine、调度它执行一次 `Done` 并等待返回的完整生命周期，不把结果叫作纯粹的 goroutine 创建指令成本。

`cmd/stack-growth` 每个 sample 都从一个新 goroutine 开始，计时器在 goroutine 内、递归调用前启动，因此递归数字不包含 goroutine 创建与 join；它观察的是不同递归深度的总耗时和均摊耗时。它没有把某一次栈拷贝单独隔离出来，也没有直接证明最终栈大小；最终栈大小还取决于递归函数的实际栈帧。

## Files

- `raw/goroutine-benchmark.txt`：生命周期 benchmark 的原始输出。
- `raw/stack-growth.txt`：5 个 fresh goroutine sample/深度的原始输出。
- `environment.txt`：Go、OS、架构、checkout 信息。

这些数字只用于解释当前实现和输入形状下的量级；换 Go 版本、架构、编译器或函数帧后必须重新运行。
