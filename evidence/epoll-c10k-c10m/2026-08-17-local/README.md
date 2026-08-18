# epoll readiness complexity model：本机证据

## 命令

```bash
python3 experiments/epoll-readiness-model/sim.py --connections 100,10000 --ready 10 --wait-calls 1000
```

模型固定每次只有 10 个就绪连接，并把 `select/poll` 的工作抽象为每次检查全部注册连接，把 `epoll` 的返回路径抽象为处理就绪事件。它只计数，不执行系统调用。

## 结论边界

在这组输入下，100 个连接需要 100000 次扫描检查，10000 个连接需要 10000000 次；就绪事件处理量都为 10000。它支持复杂度方向，不支持任何真实内核延迟、吞吐、CPU 占比或 p99 结论。真实结论需要同一 Linux 内核、服务端、客户端线程数、连接/就绪分布和多轮 raw。
