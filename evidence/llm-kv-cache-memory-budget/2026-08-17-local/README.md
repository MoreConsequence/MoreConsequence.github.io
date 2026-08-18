# KV cache budget calculator evidence

这是 `experiments/llm-kv/kv_cache_budget.py` 的纯 Python 字节账 smoke，不是 GPU、vLLM 或真实模型 serving benchmark。

## Environment and commands

- OS：macOS 26.5.1，Darwin arm64
- Python：3.14.5
- 输入：`llama3-8b`，默认 `--vram 40` 十进制 GB、`--overhead 4` 十进制 GB、`seq=4096,8192,32768`
- 命令：`python3 experiments/llm-kv/kv_cache_budget.py --model llama3-8b`
- 对照命令：`python3 experiments/llm-kv/kv_cache_budget.py --model llama3-8b --kv-dtype fp8`
- 单位：显存/权重/固定开销按十进制 GB 输入；KV 与可用余量按二进制 GiB 展示；并发在字节数上取整

## Boundary

脚本只验证公式、单位转换和向下取整，权重按参数量乘 dtype 字节估算。它不证明 CUDA 分配、框架保留区、paged allocator、decode 算力、调度、SLO 或 KV 量化质量。
