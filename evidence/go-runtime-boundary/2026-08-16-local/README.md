# go-runtime-boundary：本机证据

## 覆盖范围

本快照对应 `experiments/go-runtime-boundary/bench_test.go`，为 Go 的近期微基准文章提供统一入口：append、atomic/Mutex、channel、sync.Map、闭包、defer/panic、错误链、interface、sync.Pool、map/slice 查找、timer、string/[]byte，以及切片底层数组持有测试。

## 命令

```bash
cd experiments
go test ./go-runtime-boundary -run '^TestSubsliceRetainsBackingArray$' -bench 'Append|Atomic|Mutex|Channel|SyncMap|Closure|Defer|Panic|Error|Errors|Interface|SyncPool|Allocate256|Lookup|TimeAfter|NewTimer|String|Unsafe' -benchmem -benchtime=1s -cpu=8
go test ./go-runtime-boundary -run '^$' -bench '^(BenchmarkAtomicParallel|BenchmarkMutexParallel)$' -benchmem -benchtime=300ms -cpu=2,4,8,16
```

## 口径

- `raw/` 保存本次分组运行的 stdout；`ns/op` 会随 CPU 频率、GC、`benchtime` 和进程状态变化，不能把某一次墙钟数字外推成 Go 的固定常数。
- B/op、allocs/op、相对形状和反例路径比单次 ns/op 更稳定；文章引用的数字必须与对应 raw 文件和命令一起阅读。
- 该目录只提供本机 benchmark，不证明生产服务的尾延迟、跨核调度或数据库负载行为。
