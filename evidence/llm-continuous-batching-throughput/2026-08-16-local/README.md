# Continuous batching 教学模拟

这份快照比较同一条固定 seed 请求 trace 下的静态批与 continuous batching。它是离散事件模拟，不调用 GPU、不实现 vLLM，也不提供真实 kernel 吞吐或 SLO 结论。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Python：系统 Python 3.14.5；脚本只使用标准库
- 输入：1200 requests、seed=42、`T_DECODE_MS=10`、`MAX_BATCH=16`、prefill rate=8 tok/ms、prompt mean=300、output mean=200
- 命令：`python3 experiments/llm-batching/sim.py --arrivals "2,8,32"`
- 输出：`raw/sim.txt`

`decode 利用率`和`GPU 空闲率`是模拟器内部定义的指标；表格数字不能外推到真实 GPU。
