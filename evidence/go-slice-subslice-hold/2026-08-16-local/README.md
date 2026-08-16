# go-slice-subslice-hold：本机复现

## 目的

比较两种返回值的保留范围：`all[:keep]` 继续共享容量为 65536 的外层 slice，复制 `all[:keep]` 的外层引用则只保留前 10 个元素。两种模式都先创建同样的输入，因此这个实验观察的是 **GC 后仍可达的对象**，不是累计分配量。

## 命令

从仓库根目录执行：

```bash
cd experiments
go run ./go-runtime-boundary/cmd/slice-retention -mode=retained -total=65536 -keep=10 -width=1024
go run ./go-runtime-boundary/cmd/slice-retention -mode=copied -total=65536 -keep=10 -width=1024
```

每个模式分别启动 3 次独立进程，原始输出见 `raw/retained.txt` 和 `raw/copied.txt`。

## 解释边界

- `heap_alloc` 是调用 `runtime.GC()` 后读取的 `runtime.MemStats.HeapAlloc`，包含运行时基线、slice header 和对象分配开销，不能直接等同于用户有效数据大小。
- retained 模式的 `cap=65536` 是关键证据：返回 slice 仍共享完整外层数组；copied 模式的 `cap=10` 说明结果已经拥有独立的外层数组。
- 这是本机 Go 1.25.1/Apple Silicon 的可复现示例，不是所有 Go 版本、机器或生产服务的固定内存常数。
