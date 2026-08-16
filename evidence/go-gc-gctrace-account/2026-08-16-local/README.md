# go-gc-gctrace-account：本机 gctrace 证据

## 实验

`cmd/gc-trace` 保留 1,000,000 个包含三个指针字段的对象，并保留 `[]*item` 根集合。这样做是为了让 mark/scan 有稳定的可扫描对象图；它不是线上业务堆的替身。

## 命令

从仓库根目录执行：

```bash
cd experiments
go build -o /tmp/github-blog-gc-trace ./go-runtime-boundary/cmd/gc-trace
GOGC=50 GODEBUG=gctrace=1 /tmp/github-blog-gc-trace -n=1000000 2>&1 | rg '^(gc|objects=)'
GOGC=100 GODEBUG=gctrace=1 /tmp/github-blog-gc-trace -n=1000000 2>&1 | rg '^(gc|objects=)'
GOGC=200 GODEBUG=gctrace=1 /tmp/github-blog-gc-trace -n=1000000 2>&1 | rg '^(gc|objects=)'
```

三组原始 stderr/stdout 分别保存在 `raw/gogc-50.txt`、`raw/gogc-100.txt` 和 `raw/gogc-200.txt`。构建后再运行是有意的：直接给 `go run` 设置 `GODEBUG` 可能把编译过程的 GC 输出混入实验。

## 解释边界

- `gctrace` 的格式由 Go runtime 文档定义但允许随版本变化；本目录按 Go 1.25.1 的三段 clock/CPU 格式记录。
- `GOGC=50/100/200` 的 GC 次数只描述这次输入、这台机器和这一次进程运行，不能外推成线上吞吐或延迟结论。
- `heap start -> heap end -> live heap`、goal、栈和 globals 是运行时观测值；它们不等于请求级 p95/p99、RSS 或容器 OOM 边界。
