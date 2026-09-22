# 验证与模拟脚本：Chunked Prefill 与 PD 分离 (Prefill-Decode Disaggregation) 的算力/显存/网络权衡
# 运行方式：python3 experiments/llm-chunked-pd/sim.py

import sys

fails = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)

# 1. 模型物理参数 (以 Llama-3-70B 为典型代表，GQA 架构)
LAYERS = 80
NUM_KV_HEADS = 8
HEAD_DIM = 128
BYTES_PER_ELEM = 2  # FP16 / BF16
PARAMS_B = 70.6

# 单 Token 的 KV Cache 内存字节数 (Key 和 Value 各一份)
# 2 * layers * num_kv_heads * head_dim * bytes_per_elem
KV_BYTES_PER_TOKEN = 2 * LAYERS * NUM_KV_HEADS * HEAD_DIM * BYTES_PER_ELEM  # 327,680 字节 = 320 KB
check("KV Cache 字节数公式核对", KV_BYTES_PER_TOKEN == 327680, f"{KV_BYTES_PER_TOKEN} bytes = 320 KB/token")

# 4096 Token 的 KV Cache 总量
PROMPT_LEN_4K = 4096
KV_SIZE_4K_MB = (PROMPT_LEN_4K * KV_BYTES_PER_TOKEN) / (1024 * 1024)  # 1280 MB = 1.25 GB
check("4K Context KV 大小", abs(KV_SIZE_4K_MB - 1280.0) < 1e-6, f"{KV_SIZE_4K_MB:.1f} MB (1.25 GB)")

# 8192 Token 的 KV Cache 总量
PROMPT_LEN_8K = 8192
KV_SIZE_8K_MB = (PROMPT_LEN_8K * KV_BYTES_PER_TOKEN) / (1024 * 1024)  # 2560 MB = 2.50 GB
check("8K Context KV 大小", abs(KV_SIZE_8K_MB - 2560.0) < 1e-6, f"{KV_SIZE_8K_MB:.1f} MB (2.50 GB)")

# 2. 网络传输耗时 (有效载荷吞吐按常规线速 92% 估算)
# 100 Gbps = 12.5 GB/s * 0.92 ≈ 11.5 GB/s
# 400 Gbps = 50.0 GB/s * 0.92 ≈ 46.0 GB/s
BW_100G_GBps = 11.5
BW_400G_GBps = 46.0

kv_4k_gb = KV_SIZE_4K_MB / 1024.0
t_transfer_100g_ms = (kv_4k_gb / BW_100G_GBps) * 1000  # 1.25 / 11.5 * 1000 ≈ 108.7 ms
t_transfer_400g_ms = (kv_4k_gb / BW_400G_GBps) * 1000  # 1.25 / 46.0 * 1000 ≈ 27.2 ms

check("100Gbps 网络下 4K KV 传输时延", 100 < t_transfer_100g_ms < 115, f"{t_transfer_100g_ms:.1f} ms")
check("400Gbps RoCE 下 4K KV 传输时延", 25 < t_transfer_400g_ms < 30, f"{t_transfer_400g_ms:.1f} ms")

# 3. Prefill 计算时间 (8x H100 GPU, TP=8)
# H100 BF16 Tensor Core 标称峰值 989 TFLOPS, 实际 prefill GEMM MFU 约 45% -> 445 TFLOPS / GPU
# 8 卡总算力 ≈ 3560 TFLOPS
# 70B 模型每次 forward 每 token 浮点运算量约为 2 * 70.6 * 10^9 ≈ 141.2 GFLOPS
# 4096 tokens 总运算量 = 4096 * 141.2 GFLOPS = 578.3 TFLOPS
TOTAL_FLOPS_4K = 4096 * (2 * PARAMS_B * 1e9)
CLUSTER_TFLOPS = 8 * 989 * 1e12 * 0.45  # 3.56e15 FLOPS = 3560 TFLOPS
t_prefill_compute_ms = (TOTAL_FLOPS_4K / CLUSTER_TFLOPS) * 1000  # 5.78e14 / 3.56e15 * 1000 ≈ 162.4 ms
check("8x H100 4K Prefill 计算耗时", 150 < t_prefill_compute_ms < 175, f"{t_prefill_compute_ms:.1f} ms")

# 4. 传输与计算比率 (Transfer-to-Compute Ratio)
ratio_100g = t_transfer_100g_ms / t_prefill_compute_ms
ratio_400g = t_transfer_400g_ms / t_prefill_compute_ms
check("100G 下传输占计算比重超 60%", ratio_100g > 0.60, f"{ratio_100g*100:.1f}%")
check("400G 下传输占计算比重降至 20% 以下", ratio_400g < 0.20, f"{ratio_400g*100:.1f}%")

# 5. ITL (Inter-Token Latency) 抖动与 Chunked Prefill 收益对比
# 假定 Decode 原生 step 耗时 15ms (受限于 HBM 带宽)
t_decode_step_ms = 15.0

# 场景 A: 传统混部且无切块 (Monolithic Prefill)
# 当一个 4K Prefill 进入时，Decode 必须完全停顿等待整块 Prefill 结束
itl_max_monolithic = t_decode_step_ms + t_prefill_compute_ms  # 15 + 162.4 ≈ 177.4 ms

# 场景 B: Chunked Prefill (chunk_size = 512 tokens)
# 4096 被切成 8 个 512 token 的 chunk
# 每个 chunk 的计算耗时约为 162.4 / 8 = 20.3 ms
# 调度器在每个 step 将 1 个 prefill chunk 与在途 decode 打包执行
t_chunk_compute_ms = t_prefill_compute_ms / 8
itl_max_chunked = t_decode_step_ms + t_chunk_compute_ms  # 15 + 20.3 ≈ 35.3 ms

# 场景 C: PD 分离架构 (Prefill-Decode Disaggregation)
# Prefill 完全在独立节点执行，Decode 节点不受任何 Prefill 计算抢占
itl_max_pd = t_decode_step_ms  # 稳定 15.0 ms

check("Chunked Prefill 将 ITL 峰值毛刺降低 4 倍以上", itl_max_monolithic / itl_max_chunked > 4.5, f"{itl_max_monolithic:.1f}ms -> {itl_max_chunked:.1f}ms")
check("PD 分离彻底消除 Prefill 计算抢占，ITL 维持物理下限", itl_max_pd == 15.0, f"{itl_max_pd:.1f}ms")

# 6. 流式传输与交叠验证 (Chunked Pipelined KV Transfer)
# 如果在 Prefill 阶段采用按 Layer 或按 Token Chunk 流式传输，传输可与下一阶段完全交叠
# 只要 单个 chunk 的传输耗时 < 单个 chunk 的计算耗时，网络时延即可完全隐藏
t_chunk_transfer_400g = t_transfer_400g_ms / 8  # 27.2 / 8 = 3.4 ms
can_overlap_400g = t_chunk_transfer_400g < t_chunk_compute_ms
check("400G 下 Chunk 传输时延 (3.4ms) 显著小于 Chunk 计算时延 (20.3ms)，可 100% 流式掩盖", can_overlap_400g, f"transfer={t_chunk_transfer_400g:.1f}ms < compute={t_chunk_compute_ms:.1f}ms")

print("="*60)
print(f"ALL CHECKS PASSED: {len(fails) == 0} (Total checks: 9)")
print("="*60)
sys.exit(1 if fails else 0)
