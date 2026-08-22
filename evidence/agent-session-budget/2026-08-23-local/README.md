# evidence/agent-session-budget/2026-08-23-local

Agent 会话预算三种刹车策略的对照模拟。

## 环境

- darwin/arm64，Node v24.19.0，零第三方依赖
- 工具：`experiments/ts-agent-budget/budget.mjs`

## 运行命令

```sh
node experiments/ts-agent-budget/budget.mjs
```

## 方法参数

- 300 个独立种子会话；预算 100k token；
- 单步成本 = 6k 基础 + 15% 概率的 0~30k 尖峰（执行前不可知）；
- 策略：naive（花满才停）/ reserve（会话内历史最大值预留）/ preflight（0.8×max 预估）/ reserve-fixed（固定 30k 全局先验预留）。

## 原始输出（run.log）

| 策略 | 超支会话比例 | 平均超支(tok) | 最大超支(tok) | 平均完成步数 |
| --- | --- | --- | --- | --- |
| naive | 100.0% | 7027 | 33596 | 10.8 |
| reserve | 8.0% | 7852 | 22804 | 8.8 |
| preflight | 13.0% | 7515 | 23426 | 9.2 |
| reserve-fixed | 0.7% | 2899 | 3639 | 7.7 |

注：reserve-fixed 残余 0.7% 超支与理论吻合——步长真实 P99≈34k（6k 基础 + 尾部尖峰），
预留 30k 留下约 4k 尾部暴露，观测最大超支恰为 3.6k。

## 边界

- 成本模型是合成分布（均匀尖峰），真实工具输出分布更厚尾；
- 未建模"降级动作本身的质量损失"（提前收尾的答案价值差异）；
- 结论可外推的是方向：无先验的刹车必然超支、确定性来自用吞吐换预留量。
