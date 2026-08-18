# Nagle/延迟 ACK 时序模型：本机证据

## 命令

```bash
python3 experiments/tcp-nagle-timeline/sim.py --rtt-ms 100 --delayed-ack-ms 40 --messages 10
```

模型把 RTT 一半作为单程传播延迟，假设服务端只读不回；Nagle 让后续小写等待 ACK，`TCP_NODELAY` 立即交给传输层。脚本不打开 socket。

## 结论边界

输出只证明这组输入下的因果时间线：Nagle 首段到最后一段的间隔为 `100+40=140ms`，并抽象成 2 个段；NODELAY 抽象成 10 个段且没有模型等待。它没有实现内核 ACK 策略、MSS、拥塞窗口、网卡聚合、调度抖动或丢包，不能替代 Linux/Docker + `tc netem` + tcpdump。当前 checkout 没有旧文章声称的 118.6ms/1.5ms 原始抓包，因此正文不再把它们写成当前实测。
