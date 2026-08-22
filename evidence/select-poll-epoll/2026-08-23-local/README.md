# Go netpoll 观测证据

本目录记录 `select-poll-epoll-deep-dive` 在 2026-08-23 增加的 Go TCP 实验。

实验启动一个本机 TCP listener，建立 32 条 TCP 连接。服务端为每条连接启动一个 goroutine，让它们先停在 `io.ReadFull`；客户端等待所有服务端 reader 进入 parked 阶段后，再分别写入 1 字节并读回 echo。

它证明的是：Go 的 `net.Conn` 阻塞式 API 可以让多条连接同时等待，并在数据到达后完成读写。它不单独证明具体使用了 Linux epoll 或 macOS kqueue，也不测线程数、吞吐、p99 或事件后调度延迟。要确认具体平台后端，需要结合目标 OS 的 runtime 源码或 Linux `strace`。

## 命令

```bash
go run experiments/select-poll-epoll/go_netpoll_demo.go \
  -n 32 -settle 100ms
```

## 结果解释

- `phase=parked`：32 个 TCP 连接都已经被服务端 goroutine 接收并进入读等待前的同步点。
- `successes=32`：32 个客户端写入的字节都被服务端读到并 echo 回来。
- `release_to_done`、`first_read`、`last_read`：本机单轮观测，不是性能承诺。

同一 Go 1.25.1 / macOS 环境下，还运行了仓库已有的 netpoll 对照：

```bash
cd experiments
go run ./go-netpoll/cmd/wakeup -n 32 -rounds 1
go run ./go-netpoll/cmd/raw-syscall -n 8
```

原始输出见同目录的 `raw/go-netpoll-wakeup-macos.txt` 和 `raw/go-netpoll-raw-syscall-macos.txt`。这两条命令用于说明 netpoll 等待与裸阻塞 syscall 的路径差异，不能外推为跨平台线程数或延迟 benchmark。
