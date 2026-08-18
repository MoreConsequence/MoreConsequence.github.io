# HTTP/2 HOL 模型证据

该模型固定 20 个流、一个丢包所在流和 50ms RTT，只改变传输层的交付规则：HTTP/2 使用有序 TCP 字节流，HTTP/3/QUIC 允许其他流的包独立交付。它还显式打印每流初始窗口与连接初始窗口，避免把两个 65,535 字节误读成 20 倍可用连接预算。

## 命令

```bash
python3 experiments/http2-hol-model/sim.py \
  --streams 20 --lost-stream 1 --rtt-ms 50 \
  --stream-window 65535 --connection-window 65535
```

## 边界

- 这是传输交付和初始流控的教学模型，不是 h2/h3 栈、拥塞控制、TLS、内核或浏览器 benchmark。
- HTTP/3 仍共享连接级拥塞控制和连接流控；“其他流不被同一个字节洞挡住”不等于整条连接没有排队。
- 生产决策需要真实 RTT、丢包、响应形状、实现版本、连接复用和流控 telemetry，不能从一个 50ms 模型外推收益。
