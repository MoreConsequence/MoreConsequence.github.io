# evidence/two-phase-commit-vs-saga-outbox/2026-08-23-local

2PC / SAGA / Outbox 在统一故障注入下的行为对照（确定性模拟，无随机数）。

## 环境

- darwin/arm64，Node v24.19.0，零第三方依赖
- 工具：`experiments/distributed-tx-faults/faults.mjs`

## 运行命令

```sh
node experiments/distributed-tx-faults/faults.mjs
```

## 模型设定

- 业务目标：订单创建 ⇔ 扣款的一致性；
- 2PC：协调者四步（prepare-O/P、commit-O/P），崩溃点 = 完成第 k 步后；
- SAGA：两个本地事务 + 补偿事务，补偿失败单独成行；
- Outbox：订单+事件同库事务原子落库，relay 至少一次投递，消费端幂等键去重。

## 原始输出（run.log）

10 行注入矩阵：2PC 四个崩溃点全部依赖协调者日志恢复、期间参与者持锁阻塞；
SAGA 中间态对外可见、补偿失败降级人工；Outbox 的重复投递由幂等去重吸收。
全部路径恢复后终态一致——**分歧不在"能不能一致"，在"谁被阻塞多久、谁来收拾"**。

## 边界

- 步骤级故障注入：崩溃点粒度为"某步之后"，不覆盖网络分区中的消息丢失/乱序组合；
- 未模拟协调者日志本身损坏、补偿事务与并发新请求的交互；
- 结论是三种模式的**结构性分歧**（阻塞/可见中间态/重复投递），非具体实现调优。
