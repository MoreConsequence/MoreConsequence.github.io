# Go 分配大小与并发 benchmark：本机证据

## 命令

```bash
cd experiments
go test ./go-mallocgc-boundary -run '^$' -bench '^(BenchmarkAllocate(16|32|256|4096)|BenchmarkAllocateParallel(256|4096))$' -benchmem -benchtime=500ms -count=1 -cpu=8
```

benchmark 对固定大小的 byte slice 做直接分配，并把首字节地址保存到 sink；并发版本用 `RunParallel` 和原子指针保存 backing array，避免并发写普通全局 sink。它观察的是当前输入下的分配路径，不是对所有 Go 对象形状的 mallocgc 定律。

## 结论边界

一次运行的单 worker/8 worker 结果见 raw。数值绑定 Go 1.25.1、Darwin arm64、Apple M1 Pro、`-cpu=8`、500ms benchtime 和当前 benchmark；tiny allocator、size class、GC 与对象池是否有收益仍需结合逃逸、生命周期、峰值 HeapAlloc 和同语义 pool 对照。
