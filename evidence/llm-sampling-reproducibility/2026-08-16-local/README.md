# LLM 采样参数数学模拟

这份快照只支持文章中的 logits、temperature、top-p 和本地 RNG 结论，不证明任何供应商 API 在跨请求、跨硬件或跨模型版本下的确定性。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Python：workspace bundled Python 3.12.13（路径见 `environment.txt`）
- NumPy：2.3.5
- 输入：固定 50-token logits、随机种子 20260816；seed 对照使用 42、7；每条 seed 序列 8 次采样
- 命令：`/Users/lianghaoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 experiments/llm-sampling-reproducibility/sampling_math.py`

`raw/sampling_math.txt` 保存 stdout。脚本没有调用真实模型或 API；官方语义只作为文章引用，不由本地模拟证明。
