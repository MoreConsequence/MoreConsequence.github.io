# Kafka rebalance: stop-the-world 空窗复现

目的：把「一次成员挂死触发的 classic eager 再平衡，让消费组整组停摆」变成可量化的一张曲线，
对应文章《Kafka 再平衡的税》的第三节（机制）与第四节（代价账）。本脚手架复现的是
**classic 协议 + eager 再平衡**，不是 KIP-848 增量协议。

## 方法

- 单节点 KRaft Kafka（`apache/kafka:3.9.0`），broker 配置 `group.coordinator.rebalance.protocols=classic`。
- `kafka-producer-perf-test.sh` 以 2000 msg/s 持续生产到 8 分区 topic（生产速率已知，便于对账）。
- 3 个 `kafka-console-consumer.sh` 加入同一 group，各自 stdout 输出每条消费记录。
- 第 20s 用 `docker kill -s STOP consumer-2` 让一个成员停止发心跳（等于挂死，等价于进程被暂停）。
- `measure.py` 每秒记录：组状态（Stable/PreparingRebalance/CompletingRebalance）与组消费速率
  （`docker logs consumer-N` 行数差分）。
- 消费速率归零的区间宽度 ≈ stop-the-world 空窗；空窗 × 2000 msg/s ≈ lag 尖峰。

## 运行

```bash
cd experiments/kafka-rebalance
./run.sh                       # 全自动
# 可选环境变量：PARTITIONS=16 MEMBERS=4 SESSION_MS=10000 KILL_AFTER=30 ./run.sh
```

需要本机已装 Docker。`run.sh` 结束后 `docker compose down` 自动执行。

## 读结果

`kafka-rebalance.csv` 的 `rate_msg_per_s` 列应有如下形状：

1. **稳定段**：rate ≈ 2000（与生产速率一致，lag≈0，state=Stable）。
2. **SIGSTOP 后**：rate 维持约一个 `session.timeout.ms`（默认 6s，成员尚未被判死）。
3. **空窗段**：rate 跌到 0，state 进入 PreparingRebalance → CompletingRebalance。宽度 = 停摆窗口。
4. **恢复段**：state 回 Stable，rate 回到 2000。

## 回填文章

文章第四节留了【本机实测待补】。跑完把三个数回填：

- 停摆窗口（空窗段的秒数）；
- lag 尖峰（空窗段之前最后一个已知 offset 差，或空窗 × 2000 的估算对账）；
- 组在 Stable 态的时间占比（= 1 − 空窗累计 / 总时长）。

## 想对照 KIP-848 增量协议

把 `docker-compose.yml` 的 `KAFKA_GROUP_COORDINATOR_REBALANCE_PROTOCOLS` 改为 `consumer`
（需 KRaft 支持版本的 broker 与客户端），重复 run.sh。预期：SIGSTOP 一个成员后，
其余成员速率**不**归零，只有让位分区的短暂抖动——与 classic 的空窗形成对照。

## 已知边界

- `docker compose run -d` 每次运行用固定容器名（producer、consumer-1..N），重复运行前会先清掉（compose down）。
- 单 broker、复制因子 1，只用于机制演示，不构成生产可用性结论。
- 本实验量化的是「挂死触发」的 rebalance 窗口；扩容/滚动发布的场景把 `KILL_AFTER` 改为在成员加入前 SIGSTOP，或直接加第 4 个消费者即可观察。
