# LLM batching experiment: static batch vs continuous batching

`sim.py` is a discrete-event simulator comparing two scheduling policies on the same
request trace (fixed seed, deterministic):

- **静态批（request-level scheduling）**：GPU 空闲时取最多 `MAX_BATCH` 个请求为一批，先串行
  prefill，再整批 decode 到批内最长序列结束；批被锁定，早完成的序列不腾位。
- **continuous batching（iteration-level scheduling）**：每步 decode 后完成的序列立即腾槽，
  新请求 prefill 完成后马上补进空槽；prefill 与 decode 并行。

物理模型（教学简化，不是真实 GPU 基准）：

1. decode 是内存带宽瓶颈——单次 iteration 固定耗时 `T_DECODE_MS`，批内每个活跃序列各出
   1 个 token，活跃数在 `1..MAX_BATCH` 间变化不改变单次耗时。因此 decode 吞吐随批大小
   线性涨，这就是"批"对 decode 值钱、而对 prefill 不值钱的原因。
2. prefill 是计算瓶颈——时长 = prompt_tokens / `PREFILL_RATE`。continuous batching 里
   prefill 与 decode 并行、不拉长 decode iteration（乐观假设；现实中 prefill 会抢占计算，
   于是才有 vLLM 的 chunked prefill，见文章第五节）；静态批里 prefill 是串行独立阶段。
3. 显存/KV cache 充足，容量只由 `MAX_BATCH` 限定（显存边界见文章）。

指标：吞吐（req/s 与 output tok/s）、GPU 空闲率（wall 时间内纯空转比例）、
decode 容量利用率（Σ每步活跃数 / (MAX_BATCH × decode 步数)）、平均时延。

运行（从仓库根目录）：

```bash
python3 experiments/llm-batching/sim.py
python3 experiments/llm-batching/sim.py --arrivals "1,2,4,8,16,32" --max-batch 16
python3 experiments/llm-batching/sim.py --plot curves.png   # 需要 matplotlib
```

默认参数：`T_DECODE_MS=10`、`MAX_BATCH=16`、`PREFILL_RATE=8 tok/ms`、prompt 均值 300、
output 均值 200、seed 42、1200 个请求。`--seed` 保证同 seed 下两种策略对比同一条请求序列。

预期结论（机制层面，不是本机基准）：负载升到 decode 容量附近时，静态批吞吐被批内最慢
序列锁死、decode 利用率停在约 50%，continuous batching 逼近容量上限（利用率接近 100%）；
低负载下两者都空转，差距不大——这正好对应文章里"排队税只在负载上来之后才开始收"的判断。
