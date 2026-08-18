# TCP SYN/accept backlog probe：本机证据

## 命令

```bash
python3 experiments/tcp-syn-backlog/probe.py --backlog 2 --clients 6 --timeout 0.5 --hold 1.0
```

监听线程绑定 loopback，调用 `listen(2)` 后在 hold 窗口内不调用 `accept()`；客户端并发调用 `connect()`，成功的 socket 在所有尝试结束前保持打开。

## 结论边界

本次 Darwin 运行得到 2 个 `connected`、4 个 `timeout`，支持“未排空 accept 路径时，连接建立会受到排队容量和客户端超时影响”。它不支持把 `backlog=2` 解读为所有平台都恰好容纳 2 个连接。Linux 的 SYN cookies、内核版本、`somaxconn`、`tcp_max_syn_backlog`、回环实现和调度都可能改变结果；Linux 队列容量与溢出判断需要另存 `ss`、内核计数器和抓包证据。
