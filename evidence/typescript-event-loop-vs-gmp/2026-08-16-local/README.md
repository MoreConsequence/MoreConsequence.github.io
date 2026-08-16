# typescript-event-loop-vs-gmp：本机证据

## 命令

```bash
cd experiments/ts-event-loop
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node blocking2.ts
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node order.ts
go run go-sleep.go
```

## 口径

这三个程序不是一个 benchmark：`go-sleep.go` 观察 `GOMAXPROCS=1` 下的两个等待 goroutine，`blocking2.ts` 观察 Node 主线程同步 CPU 工作推迟 timer，`order.ts` 观察顶层阶段顺序。时间只保存为一次本机观察；不要把它们合并成语言性能结论。
