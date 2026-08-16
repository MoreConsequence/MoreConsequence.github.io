# LLM-as-judge stub 管线

这份快照只证明仓库里的 stub 可以按固定样本输出位置翻盘、一致率和 kappa；它不证明任何真实模型的偏差率，也不替代人工标注。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Python：系统 Python 3.14.5；脚本只使用标准库
- 输入：8 个固定 A/B/tie 样本，每个样本按两个顺序各评一次
- 命令：`python3 experiments/llm-judge/llm_judge_position_bias.py --judge stub`
- 输出：`raw/stub.txt`
