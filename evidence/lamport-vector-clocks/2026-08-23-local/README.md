# evidence/lamport-vector-clocks/2026-08-23-local

Lamport 时钟 vs 向量时钟确定性模拟的原始输出。

## 环境

- darwin/arm64，Node v24.19.0，零第三方依赖
- 工具：`experiments/lamport-vector-clocks/simulate.mjs`

## 运行命令

```sh
node experiments/lamport-vector-clocks/simulate.mjs
```

## 方法参数

- 固定种子 seed=20260823（mulberry32 PRNG），3 进程，60 个事件（local/send/recv 随机调度）；
- 消息异步投递、可能乱序到达前堆积在 net 中；判定规则：VC(a) ≤ VC(b) 且至少一维严格小 ⇒ a → b。

## 原始输出

- `run.log`：1770 个无序事件对中，因果相关 601（34%）、并发 1169（66%）；
  并发对里 1120 对（**约 96%**）被 Lamport 全序强排出"先后"（两侧时间戳不等），
  其余 49 对为时间戳相等（tiebreak 同样会强排）。占全部事件对的 **63%**。
- `run2-repeat.log` 与 `run.log` 逐字节相同（`diff` 为空），固定种子可复现。

## 边界

- 数字来自本模拟的事件分布（35% local / 30% send / 35% recv 的调度概率），
  换参数会得到不同比例；不变的是结论方向：Lamport 全序中的"先后"大部分不是因果；
- 本模拟不含真实网络（乱序/丢包由 inbox 模型近似）。
