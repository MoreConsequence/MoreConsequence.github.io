# typescript-event-loop-vs-gmp：本机证据

这份快照分别运行三个教学程序：Go 等待 goroutine、Node 主线程 busy loop 推迟 timer、Node 顶层 timer 阶段顺序。它们不是同一个 benchmark，不用于比较 Go 与 Node 的性能。

## 命令

从仓库根目录运行：

```bash
cd experiments/ts-event-loop
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node blocking2.ts
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node order.ts
go run go-sleep.go
```

直接使用 `node blocking2.ts` 依赖当前 shell 的 Node/TypeScript 执行方式；本快照使用 Node v24.19.0，避免把 Node v18 的 `.ts` 扩展名错误混入实验结论。

## 口径

- `go-sleep.go` 观察 `GOMAXPROCS=1` 下的两个等待 goroutine；
- `blocking2.ts` 观察 Node 主线程同步 CPU 工作推迟 timer；
- `order.ts` 观察当前 Node 顶层阶段顺序；
- 时间和顺序只代表本机一次运行，不能外推为语言性能排名或跨版本调度合同。

原始输出见 `raw/`，环境见 `environment.txt`。
