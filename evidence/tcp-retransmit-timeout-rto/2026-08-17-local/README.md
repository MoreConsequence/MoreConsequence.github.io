# TCP RTO 退避时间线模型：本机证据

## 命令

```bash
python3 experiments/tcp-rto-timeline/sim.py --srtt-ms 100 --rttvar-ms 20 --timeouts 3
```

初始 RTO 按 `SRTT + 4*RTTVAR` 计算为 180ms；每次超时后将下一次 RTO 翻倍，并把该重传轮次的 RTT 样本标为 `discarded_by_karn`。快速重传单独表示为 3 个重复 ACK 触发，不等待 RTO。

## 结论边界

这是 RFC 6298 风格的确定性教学模型，不实现拥塞窗口、ACK/SACK 生成、丢包、Linux 时钟、内核状态或真实网络。因此 180/360/720ms 是输入参数的派生值，不是 Linux 默认 RTO，也不是 `tc netem` 抓包结果。若要做 Linux 实证，必须保存内核版本、netem 参数、负载、抓包和多轮 raw。
