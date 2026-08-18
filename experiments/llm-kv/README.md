# KV cache 显存预算计算器

`kv_cache_budget.py` 用纯标准库把「每 token 的 KV 字节 → 不同 seq_len × batch 的显存 → 并发上限」算成一张表。`--vram` 与 `--overhead` 使用十进制 GB，KV 表格显示二进制 GiB；并发整除在字节数上完成，避免把 GB/GiB 混成一个单位。核心公式只有一步，可手算复核：

```
per-token per-layer KV 字节 = 2 (K 与 V) × num_kv_heads × head_dim × bytes_per_elem
per-token KV 字节          = per-token per-layer × num_hidden_layers
单请求 KV                 = per-token KV 字节 × seq_len
并发上限                 = (显存 − 权重 − 固定开销) ÷ 单请求 KV
```

模型配置取自 Hugging Face `meta-llama/*` 公开 `config.json`（核对日期 2026-08-16）：Llama-2-7B 为 MHA（kv_heads=32）、Llama-2-13B 为 MHA（kv_heads=40）、Llama-2-70B 为 GQA（kv_heads=8）、Llama-3-8B 为 GQA（kv_heads=8），head_dim 均为 128。

## 运行

从仓库根目录：

```bash
python3 experiments/llm-kv/kv_cache_budget.py --model llama3-8b
python3 experiments/llm-kv/kv_cache_budget.py --model llama2-7b
python3 experiments/llm-kv/kv_cache_budget.py --model llama2-13b
python3 experiments/llm-kv/kv_cache_budget.py --model llama2-70b
```

可选项：`--vram`（默认 40 十进制 GB）、`--dtype`（权重 dtype，fp16/bf16/fp8/int8，默认 fp16）、`--kv-dtype`（KV cache dtype，缺省同 `--dtype`）、`--seq`（默认 4096,8192,32768）。

`--kv-dtype` 与 `--dtype` 分开，是为了把「只量化 KV」和「权重量化」分开算：只量化 KV 时（如 `--dtype fp16 --kv-dtype fp8`）权重估算仍是 16.0 十进制 GB，KV 字节减半；`--dtype fp8` 则是权重与 KV 一起按 1 字节计。真实 serving 里两者是独立的（KV 量化不动权重，权重量化可以搭配 KV fp16），按需要选。

## 示例输出（Llama-3-8B，40GB 卡，fp16）

```
$ python3 experiments/llm-kv/kv_cache_budget.py --model llama3-8b
模型: Llama-3-8B  权重 dtype: fp16  KV dtype: fp16  层数=32  kv_heads=8  head_dim=128
每层每 token K/V: 4096 B  (4 KiB)
每 token 全层 K/V: 131072 B = 128.0 KiB
权重(估算): 16.0 GB  固定开销: 4.0 GB  可用给 KV: 18.626 GiB

 seq_len       单请求 KV   batch=1 总 KV       并发上限      并发时 KV 上限
------------------------------------------------------------------
    4096     0.500 GiB        0.500 GiB         37      18.500 GiB
    8192     1.000 GiB        1.000 GiB         18      18.000 GiB
   32768     4.000 GiB        4.000 GiB          4      16.000 GiB
```

## 只量化 KV（fp8，权重保持 fp16）

```
$ python3 experiments/llm-kv/kv_cache_budget.py --model llama3-8b --kv-dtype fp8
模型: Llama-3-8B  权重 dtype: fp16  KV dtype: fp8  层数=32  kv_heads=8  head_dim=128
每层每 token K/V: 2048 B  (2 KiB)
每 token 全层 K/V: 65536 B = 64.0 KiB
权重(估算): 16.0 GB  固定开销: 4.0 GB  可用给 KV: 18.626 GiB

 seq_len       单请求 KV   batch=1 总 KV       并发上限      并发时 KV 上限
------------------------------------------------------------------
    4096     0.250 GiB        0.250 GiB         74      18.500 GiB
    8192     0.500 GiB        0.500 GiB         37      18.500 GiB
   32768     2.000 GiB        2.000 GiB          9      18.000 GiB
```

KV 字节从 128 KiB/token 减到 64 KiB/token；在相同十进制显存、权重和固定开销假设下，并发上限大致翻倍（37→74、18→37、4→9），但向下取整会让每一行的倍数不完全相同。代价是精度，见文章第五节的精度讨论；本仓库没有 fp16/fp8 质量对照 raw。

## 边界

- 这是「理想分页、按需精确分配」的上界：假定每个请求的 KV 恰好等于实际长度。
  如果按 vLLM 论文报告的连续预分配做法（每个请求预分配最大序列长度的连续内存），
  有效利用率只有 20.4%–38.2%，真实并发会更低。
- 权重按 `参数 × 字节/元素` 估算，参数按十亿参数 × 1e9 字节计算，不含 embedding 与输出头的精度细节。
- 显存参数使用十进制 GB，KV 大小和可用余量用二进制 GiB 展示；真实 GPU、驱动和框架还会有分配粒度与保留区差异。
- 固定开销 4 GB 只是给 CUDA context、激活与预填充峰值留的粗略余量，不是引擎实测值。
- 并发上限取整为整数；实际 serving 还要受 decode 算力、scheduler 与 SLO 约束。
