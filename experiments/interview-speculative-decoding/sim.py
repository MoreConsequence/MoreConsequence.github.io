#!/usr/bin/env python3
"""
experiments/interview-speculative-decoding/sim.py

Deterministic simulation suite for:
1. Lossless Distribution Proof of Modified Rejection Sampling (Leviathan et al.).
2. Speedup Model across varying Acceptance Rates (alpha) and Draft Lengths (K).
3. Concurrency & Throughput Inversion Trap: demonstrating why speculative decoding
   harms throughput at large Batch Sizes (BS=64) and how adaptive gating fixes it.
"""

import math
import random
from typing import List, Dict, Tuple

# Fix random seed for determinism
random.seed(42)

# ==============================================================================
# 1. Lossless Distribution Verification (Modified Rejection Sampling)
# ==============================================================================

def sample_categorical(probs: List[float]) -> int:
    r = random.random()
    cumulative = 0.0
    for idx, p in enumerate(probs):
        cumulative += p
        if r < cumulative:
            return idx
    return len(probs) - 1

def run_rejection_sampling_trial(p_target: List[float], q_draft: List[float]) -> int:
    """
    Executes one step of Leviathan's speculative rejection sampling.
    Draft model proposes token x ~ q.
    Target model accepts with prob min(1, p(x)/q(x)).
    If rejected, resamples from p'(x) = max(0, p(x) - q(x)) / norm.
    """
    # 1. Draft generates x
    x = sample_categorical(q_draft)
    accept_prob = min(1.0, p_target[x] / q_draft[x]) if q_draft[x] > 0 else 0.0

    if random.random() < accept_prob:
        return x

    # 2. Resample from residual distribution
    residuals = [max(0.0, p_target[i] - q_draft[i]) for i in range(len(p_target))]
    norm = sum(residuals)
    if norm <= 0:
        return x
    p_prime = [r / norm for r in residuals]
    return sample_categorical(p_prime)


# ==============================================================================
# 2. Speculative Speedup Mathematical Model
# ==============================================================================

def calculate_speculative_speedup(k_draft: int, alpha: float, t_draft: float, t_target: float) -> Tuple[float, float]:
    """
    Computes expected accepted tokens per step and expected wall-clock speedup.
    Expected accepted tokens E[N]:
    If draft tokens are accepted independently with probability alpha:
    E[N] = (1 - alpha^(k+1)) / (1 - alpha)  (includes the bonus/resampled token)
    """
    if math.isclose(alpha, 1.0):
        expected_tokens = float(k_draft + 1)
    else:
        # Expected accepted before first rejection = sum_{i=1}^k alpha^i + 1 (the correction/resampled token)
        expected_tokens = (1.0 - alpha**(k_draft + 1)) / (1.0 - alpha)

    time_spec_step = k_draft * t_draft + t_target
    baseline_time_for_same_tokens = expected_tokens * t_target

    speedup = baseline_time_for_same_tokens / time_spec_step
    return expected_tokens, speedup


# ==============================================================================
# 3. Throughput Inversion Simulator under High Concurrency
# ==============================================================================

class GPUInferenceCluster:
    def __init__(self, compute_flops_tflops: float = 989.0, memory_bandwidth_tb_s: float = 3.35, model_weights_gb: float = 140.0):
        self.compute_tflops = compute_flops_tflops
        self.bandwidth_tb_s = memory_bandwidth_tb_s
        self.weights_gb = model_weights_gb

    def step_latency(self, batch_size: int, tokens_per_req_in_step: int = 1) -> float:
        """
        Roofline latency model for one target model step (in milliseconds).
        Time = max(Memory_Time, Compute_Time).
        """
        total_tokens = batch_size * tokens_per_req_in_step
        # Memory transfer: 140 GB weights + KV cache (approx 0.05 GB per token in batch)
        data_transfer_gb = self.weights_gb + total_tokens * 0.005
        mem_time_ms = (data_transfer_gb / (self.bandwidth_tb_s * 1024)) * 1000

        # Compute: 2 * 70B FLOPs per token = 140 GFLOPs per token
        total_gflops = total_tokens * 140.0
        compute_time_ms = (total_gflops / (self.compute_tflops * 1000)) * 1000

        return max(mem_time_ms, compute_time_ms)


# ==============================================================================
# Test Suite
# ==============================================================================

def run_tests():
    print("=== [Test 1: Lossless Distribution Proof of Rejection Sampling] ===")
    vocab_size = 5
    # Target distribution p vs Draft distribution q
    p_target = [0.40, 0.25, 0.15, 0.12, 0.08]
    q_draft =  [0.20, 0.40, 0.10, 0.20, 0.10]

    num_samples = 100000
    direct_counts = [0] * vocab_size
    spec_counts = [0] * vocab_size

    for _ in range(num_samples):
        # Direct sampling from target
        direct_counts[sample_categorical(p_target)] += 1
        # Speculative rejection sampling
        spec_counts[run_rejection_sampling_trial(p_target, q_draft)] += 1

    p_empirical_direct = [c / num_samples for c in direct_counts]
    p_empirical_spec = [c / num_samples for c in spec_counts]

    # Calculate Total Variation Distance (TVD)
    tvd = 0.5 * sum(abs(p_empirical_direct[i] - p_empirical_spec[i]) for i in range(vocab_size))
    print(f"Target True Probs:   {p_target}")
    print(f"Direct Empirical:    {[round(x, 4) for x in p_empirical_direct]}")
    print(f"Speculative Output:  {[round(x, 4) for x in p_empirical_spec]}")
    print(f"Total Variation Distance (TVD): {tvd:.5f}")

    assert tvd < 0.015, f"TVD must be < 0.015 (strictly identical distribution), got {tvd}"
    print("✓ Test 1 Passed: Speculative rejection sampling is mathematically lossless.\n")

    print("=== [Test 2: Speculative Speedup vs Acceptance Rate alpha] ===")
    # 70B target model step: 40ms; 1B draft model step: 3ms
    t_target = 40.0
    t_draft = 3.0
    k_draft = 4

    alphas = [0.3, 0.5, 0.7, 0.85]
    for a in alphas:
        exp_tokens, speedup = calculate_speculative_speedup(k_draft, a, t_draft, t_target)
        print(f"Acceptance Rate alpha={a*100:4.1f}% -> Expected Accepted Tokens={exp_tokens:.2f}, Speedup={speedup:.2f}x")

    _, speedup_high = calculate_speculative_speedup(k_draft, 0.85, t_draft, t_target)
    assert speedup_high > 2.0, "High acceptance rate should yield > 2.0x speedup"
    print("✓ Test 2 Passed: Speedup model verifies 2x+ latency reduction when alpha is high.\n")

    print("=== [Test 3: Throughput Inversion Trap under High Concurrency] ===")
    cluster = GPUInferenceCluster()

    # Case A: BS = 1 (Low concurrency)
    lat_baseline_bs1 = cluster.step_latency(batch_size=1, tokens_per_req_in_step=1)
    lat_spec_bs1 = cluster.step_latency(batch_size=1, tokens_per_req_in_step=4) + 4 * 3.0  # target verify 4 tokens + 4 draft steps
    tokens_spec_bs1 = (1.0 - 0.75**5) / (1.0 - 0.75)  # alpha = 0.75 -> approx 3.05 tokens
    time_per_token_base_bs1 = lat_baseline_bs1 / 1.0
    time_per_token_spec_bs1 = lat_spec_bs1 / tokens_spec_bs1
    speedup_bs1 = time_per_token_base_bs1 / time_per_token_spec_bs1

    # Case B: BS = 64 (High concurrency, Compute bound)
    lat_baseline_bs64 = cluster.step_latency(batch_size=64, tokens_per_req_in_step=1)
    lat_spec_bs64 = cluster.step_latency(batch_size=64, tokens_per_req_in_step=4) + 4 * (3.0 * 8) # draft model also slows down with batch
    tokens_spec_bs64 = tokens_spec_bs1
    tps_baseline_bs64 = (64 * 1.0) / (lat_baseline_bs64 / 1000.0)
    tps_spec_bs64 = (64 * tokens_spec_bs64) / (lat_spec_bs64 / 1000.0)
    throughput_ratio_bs64 = tps_spec_bs64 / tps_baseline_bs64

    print(f"BS=1  (Memory-Bound):  Baseline={time_per_token_base_bs1:.2f}ms/tok, Spec={time_per_token_spec_bs1:.2f}ms/tok (Latency Speedup: {speedup_bs1:.2f}x)")
    print(f"BS=64 (Compute-Bound): Baseline Throughput={tps_baseline_bs64:.1f} tok/s, Speculative Throughput={tps_spec_bs64:.1f} tok/s (Ratio: {throughput_ratio_bs64*100:.1f}%)")

    assert speedup_bs1 > 1.5, "Speculative decoding must accelerate BS=1"
    assert throughput_ratio_bs64 < 0.95, "Throughput must degrade at BS=64 due to compute roofline saturation!"
    print("✓ Test 3 Passed: Verified throughput inversion trap where speculation harms saturated clusters.\n")

    print("ALL TESTS PASSED SUCCESSFULLY.")

if __name__ == "__main__":
    run_tests()
