#!/usr/bin/env python3
"""KV cache 显存预算计算器。

核心公式（可手算复核）：
    per-token per-layer KV 字节 = 2 (K 与 V) × num_kv_heads × head_dim × bytes_per_elem
    per-token KV 字节          = per-token per-layer × num_hidden_layers
    单个请求在 seq_len 下的 KV  = per-token KV 字节 × seq_len × batch

并发上限 = (显存 − 权重 − 固定开销) ÷ 单请求 KV。

模型配置来自 Hugging Face 上 meta-llama 公开 config.json（核对日期 2026-08-16）：
  Llama-2-7B  : layers=32 q_heads=32 kv_heads=32 head_dim=128  （MHA）
  Llama-2-13B : layers=40 q_heads=40 kv_heads=40 head_dim=128  （MHA）
  Llama-2-70B : layers=80 q_heads=64 kv_heads=8  head_dim=128  （GQA）
  Llama-3-8B  : layers=32 q_heads=32 kv_heads=8  head_dim=128  （GQA）

权重大小默认按 fp16（2 字节/参数）估算。`--vram` 与 `--overhead` 使用十进制 GB，
KV 表格同时显示二进制 GiB；所有并发整除都在字节数上进行。这是教学演示，不是 serving 引擎的
内存分配模型；vLLM/SGLang 还要算 CUDA context、激活、预填充峰值等固定开销。
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

BYTES_PER_ELEM = {"fp16": 2, "bf16": 2, "fp8": 1, "int8": 1, "fp32": 4}


@dataclass(frozen=True)
class Model:
    name: str
    layers: int
    kv_heads: int
    head_dim: int
    params_b: float  # 十亿参数，用于估算 fp16 权重大小


PRESETS = {
    "llama2-7b": Model("Llama-2-7B", 32, 32, 128, 7.0),
    "llama2-13b": Model("Llama-2-13B", 40, 40, 128, 13.0),
    "llama2-70b": Model("Llama-2-70B", 80, 8, 128, 70.0),
    "llama3-8b": Model("Llama-3-8B", 32, 8, 128, 8.0),
}


def kv_bytes_per_token(model: Model, dtype: str) -> int:
    """全层每 token 的 K/V 字节数。"""
    per_layer = 2 * model.kv_heads * model.head_dim * BYTES_PER_ELEM[dtype]
    return per_layer * model.layers


def gib(num_bytes: float) -> float:
    return num_bytes / (2**30)


def main() -> None:
    parser = argparse.ArgumentParser(description="KV cache 显存预算")
    parser.add_argument("--model", choices=PRESETS.keys(), default="llama3-8b")
    parser.add_argument("--vram", type=float, default=40.0, help="GPU 显存，十进制 GB")
    parser.add_argument("--dtype", choices=BYTES_PER_ELEM.keys(), default="fp16",
                        help="权重的 dtype（KV 未单独指定时也用于 KV）")
    parser.add_argument("--kv-dtype", choices=BYTES_PER_ELEM.keys(), default=None,
                        help="KV cache 的 dtype，缺省与 --dtype 相同。"
                             "只量化 KV 时（如 --dtype fp16 --kv-dtype fp8）权重保持 fp16，"
                             "KV 字节减半，区别于权重量化")
    parser.add_argument("--overhead", type=float, default=4.0,
                        help="CUDA context + 激活 + 预填充峰值等固定开销，十进制 GB")
    parser.add_argument("--seq", default="4096,8192,32768",
                        help="要评估的上下文长度，逗号分隔")
    parser.add_argument("--batch", type=int, default=1,
                        help="单请求 batch，仅用于展示总占用")
    args = parser.parse_args()

    kv_dtype = args.kv_dtype if args.kv_dtype is not None else args.dtype
    model = PRESETS[args.model]
    weight_bytes = model.params_b * 1_000_000_000 * BYTES_PER_ELEM[args.dtype]
    overhead_bytes = args.overhead * 1_000_000_000
    vram_bytes = args.vram * 1_000_000_000
    per_token = kv_bytes_per_token(model, kv_dtype)
    usable_bytes = vram_bytes - weight_bytes - overhead_bytes
    weights_gb = weight_bytes / 1_000_000_000
    usable_gib = max(usable_bytes, 0.0) / (2**30)

    print(f"模型: {model.name}  权重 dtype: {args.dtype}  KV dtype: {kv_dtype}  "
          f"层数={model.layers}  kv_heads={model.kv_heads}  head_dim={model.head_dim}")
    print(f"每层每 token K/V: {2 * model.kv_heads * model.head_dim * BYTES_PER_ELEM[kv_dtype]} B  "
          f"({per_token // model.layers // 1024} KiB)")
    print(f"每 token 全层 K/V: {per_token} B = {per_token / 1024:.1f} KiB")
    print(f"权重(估算): {weights_gb:.1f} GB  固定开销: {args.overhead:.1f} GB  "
          f"可用给 KV: {usable_gib:.3f} GiB")
    if usable_bytes < 0:
        print(f"!! 权重 + 固定开销已超过 {args.vram:.0f} GB，该模型在此卡上放不下，"
              "需量化权重或换更大显存。")
    print()
    print(f"{'seq_len':>8} {'单请求 KV':>12} {'batch=%d 总 KV' % args.batch:>14} "
          f"{'并发上限':>10} {'并发时 KV 上限':>14}")
    print("-" * 66)
    for seq in (int(s) for s in args.seq.split(",")):
        one_bytes = per_token * seq
        one = gib(one_bytes)
        total = one * args.batch
        cap = int(usable_bytes // one_bytes) if usable_bytes > 0 and one_bytes > 0 else 0
        cap_kv = cap * one
        print(f"{seq:>8} {one:>9.3f} GiB {total:>12.3f} GiB {cap:>10} {cap_kv:>11.3f} GiB")


if __name__ == "__main__":
    main()
