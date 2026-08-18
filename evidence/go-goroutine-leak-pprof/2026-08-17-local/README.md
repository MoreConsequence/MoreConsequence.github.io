# goroutine 泄漏 profile：本机证据

## 命令

```bash
cd experiments
go run ./go-goroutine-leak-pprof -per-kind 300
```

程序固定启动三组各 300 个 goroutine：阻塞发送、阻塞接收、没有可触发分支的 `select`。所有 goroutine 报告已进入阻塞点后，读取 `NumGoroutine`、`MemStats` 和 `pprof.Lookup("goroutine")` 的 debug=1 profile；输出只保留稳定的分组计数和源码行，不保留地址。

## 结论边界

本次运行证明了三种等待形状各有 300 个 profile 成员，并能定位到源码行。`heap_alloc`、`stack_inuse` 是同一运行快照，不是跨版本的内存预算，也不能据此宣称 heap 差值为零或生产 goroutine 成本固定。真实服务仍应使用两帧 profile、取消/超时故障测试和资源指标一起判断。
