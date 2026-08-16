# LLM-as-judge 位置偏差与人工一致性量化

`llm_judge_position_bias.py` 对一组样本做两件事：

1. **量化位置偏差**：每个样本按 `[A, B]` 与 `[B, A]` 两个顺序各评一次，交换顺序后内容层面的赢家不一致，即判定该样本被位置偏差影响（flip）。位置偏差率 = 翻盘样本数 ÷ 双方都给出明确赢家的样本数。
2. **对照人工标注**：用顺序 1 的内容赢家与 `data/samples.json` 里的 `human_label`（A/B/tie）算一致率，并给出 Cohen's kappa（修正随机一致后的真实一致性）。

纯 Python 标准库实现，无第三方依赖。

## 数据

`data/samples.json` 内置 8 个样本，覆盖问答正确性、完整性、代码/协议解释等；`human_label` 为人工标注（A/B/tie，其中 tie 表示两者质量相当）。

## 运行

### 1) 占位裁判（默认，验证管线可运行）

```bash
python3 experiments/llm-judge/llm_judge_position_bias.py --judge stub
```

占位裁判是确定性规则，刻意模拟论文报告的「位置偏好 + 冗长偏好」两类偏差，只用于验证检测管线本身能跑通，**不代表任何真实模型**，其输出不能作为真实偏差数据。

### 2) API 真实裁判

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8000/v1   # 本地 vLLM / Ollama 的 OpenAI 兼容端点
export OPENAI_API_KEY=EMPTY
export JUDGE_MODEL=<你本地的模型名>
python3 experiments/llm-judge/llm_judge_position_bias.py --judge api
```

也支持任何 OpenAI 兼容的云 API（把 `OPENAI_BASE_URL` 换成对应端点、`OPENAI_API_KEY` 换成真实密钥即可）。裁判被要求只输出 `{"winner": "A"|"B"|"tie"}`；输出不合法时该样本记为 `format_error`，不参与翻盘统计（这本身也是「格式崩塌」的一种现场观察）。

## 输出指标定义

| 指标 | 定义 |
| --- | --- |
| 位置偏差率 | 交换展示顺序后内容赢家发生翻盘的样本占比（排除任一次判定为 tie/format_error 的样本） |
| 与人工一致率 | judge 判定（A/B/tie）与 `human_label` 相同的样本占比 |
| Cohen's kappa | 修正随机一致后的真实一致率；<0.2 极低，0.2–0.4 一般，0.4–0.6 中等，0.6–0.8 较强 |

## 与论文对照

- MT-Bench 论文（Zheng et al., 2023）报告：GPT-4 交换两个候选顺序后判断一致率仅 65.0%（即约 35% 的样本被位置翻盘），few-shot 提示可提升到 77.5%。
- 位置偏差在「两个候选质量接近」时最明显——本脚本的占位裁判在 tie 样本上出现翻盘，即此现象的最小演示。
- 真实数值请用 `--judge api` 配本地模型复跑后回填正文。
