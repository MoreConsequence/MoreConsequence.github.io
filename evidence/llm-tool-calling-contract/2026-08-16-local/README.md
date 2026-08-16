# Agent 工具错误形状模拟

这份快照只支持确定性启发式模拟中的轮数、token 和成功率差异，不证明真实模型面对相同错误 body 时会达到同样成功率。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Node：v24.19.0
- 输入：同一库存不足失败，最多 5 轮；单轮固定 500 输入 + 100 输出 token；批量统计 100 次
- 命令：`node experiments/llm-tool-calling-contract/simulate.mjs`
- 输出：`raw/simulate.txt`
