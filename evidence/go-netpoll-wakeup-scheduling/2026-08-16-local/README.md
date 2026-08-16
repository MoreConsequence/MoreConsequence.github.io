# Go netpoll 唤醒与阻塞 syscall

这份快照只支持文章中关于“pollable socket 的 G 可以 park、raw syscall 会 pin M”的本机观察。它不证明 Linux epoll 的线程峰值，也不代表真实网卡延迟。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Go：1.25.1
- CPU：Apple M1 Pro，`GOMAXPROCS=8`
- 批量 socket：1000 个阻塞读，3 轮；观测到 OS threads=8、p50=2.999ms、p90=7.344ms、p99=7.623ms、max=7.725ms
- 隔离 socket：1 个阻塞读，1000 轮，`-settle 500us -init-sleep 20ms`；观测到 p50=43µs、p90=76µs、p99=374µs、max=615µs
- raw syscall：64 个阻塞读；macOS 本次 `OS threads(now)=8`、`peak=8`，没有额外 runnable work，因此不能据此推出线程一定增长

完整命令和平台差异见 `experiments/go-netpoll/README.md`；原始 stdout 在 `raw/`。
