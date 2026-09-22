#!/usr/bin/env python3
"""
experiments/interview-llm-gateway/sim.py

Deterministic simulation suite for Modern LLM Agent Gateway:
1. Cache-Aware Prefix Routing (Radix/Trie affinity) vs Round-Robin / Random routing.
2. Two-Phase Token Leaky Bucket (Reserve-Commit pattern with reconciliation).
3. Streaming Backpressure & Client-Abort KV Cache Reclamation.
"""

import sys
import math
import zlib
import collections
from typing import List, Dict, Tuple, Optional

# ==============================================================================
# 1. Cache-Aware Prefix Routing Simulator
# ==============================================================================

class GPUNode:
    def __init__(self, node_id: int, max_cached_blocks: int = 512):
        self.node_id = node_id
        self.max_cached_blocks = max_cached_blocks
        # OrderedDict for LRU prefix cache of block hashes
        self.cached_blocks: collections.OrderedDict = collections.OrderedDict()
        self.pending_requests: int = 0
        self.total_prefill_tokens: int = 0
        self.cache_hits: int = 0
        self.total_requests: int = 0

    def calculate_hit_tokens(self, prompt_blocks: List[str]) -> int:
        """Counts consecutive matching prefix blocks from index 0."""
        hit_count = 0
        for b in prompt_blocks:
            if b in self.cached_blocks:
                hit_count += 1
            else:
                break
        return hit_count * 16

    def admit_request(self, prompt_blocks: List[str]) -> Tuple[int, int]:
        """
        Processes prompt. Returns (hit_tokens, computed_prefill_tokens).
        Updates LRU cache.
        """
        self.total_requests += 1
        hit_tokens = self.calculate_hit_tokens(prompt_blocks)
        total_tokens = len(prompt_blocks) * 16
        computed_tokens = total_tokens - hit_tokens

        # Touch and insert blocks with LRU eviction
        for b in prompt_blocks:
            if b in self.cached_blocks:
                self.cached_blocks.move_to_end(b)
            else:
                if len(self.cached_blocks) >= self.max_cached_blocks:
                    self.cached_blocks.popitem(last=False)  # Evict oldest
                self.cached_blocks[b] = True

        self.cache_hits += (1 if hit_tokens > 0 else 0)
        self.total_prefill_tokens += computed_tokens
        return hit_tokens, computed_tokens


class LLMGatewayRouter:
    def __init__(self, nodes: List[GPUNode], alpha: float = 1.0, beta: float = 0.5):
        self.nodes = nodes
        self.alpha = alpha  # Weight for cache hit tokens
        self.beta = beta    # Penalty weight for pending queue load

    def route_round_robin(self, prompt_blocks: List[str], rr_index: int) -> GPUNode:
        node = self.nodes[rr_index % len(self.nodes)]
        return node

    def route_cache_aware(self, prompt_blocks: List[str]) -> GPUNode:
        best_score = -float('inf')
        best_candidates = []
        total_prompt_tokens = len(prompt_blocks) * 16

        for node in self.nodes:
            hit_tokens = node.calculate_hit_tokens(prompt_blocks)
            cache_ratio = hit_tokens / total_prompt_tokens if total_prompt_tokens > 0 else 0.0
            
            # Score function balancing cache affinity and node queue
            score = self.alpha * cache_ratio - self.beta * (node.pending_requests / 10.0)
            if score > best_score:
                best_score = score
                best_candidates = [node]
            elif math.isclose(score, best_score, abs_tol=1e-6):
                best_candidates.append(node)

        if len(best_candidates) == 1:
            return best_candidates[0]

        # On tie (e.g. cold start or zero match), use consistent hash of the prefix root
        prefix_key = prompt_blocks[0] if prompt_blocks else ""
        chosen_idx = zlib.crc32(prefix_key.encode('utf-8')) % len(best_candidates)
        return best_candidates[chosen_idx]


# ==============================================================================
# 2. Two-Phase Token Leaky Bucket Rate Limiter
# ==============================================================================

class TwoPhaseTokenBucket:
    def __init__(self, capacity: int, refill_rate_per_sec: float):
        self.capacity = float(capacity)
        self.current_tokens = float(capacity)
        self.refill_rate = refill_rate_per_sec
        self.last_update = 0.0
        self.active_reservations: Dict[str, float] = {}

    def _refill(self, now: float):
        delta = max(0.0, now - self.last_update)
        self.current_tokens = min(self.capacity, self.current_tokens + delta * self.refill_rate)
        self.last_update = now

    def reserve(self, req_id: str, prompt_tokens: int, estimated_completion: int, now: float) -> bool:
        self._refill(now)
        total_reserve = prompt_tokens + estimated_completion
        if self.current_tokens >= total_reserve:
            self.current_tokens -= total_reserve
            self.active_reservations[req_id] = total_reserve
            return True
        return False

    def reconcile(self, req_id: str, prompt_tokens: int, actual_completion: int, now: float) -> float:
        """Releases reserved tokens that were not actually consumed."""
        self._refill(now)
        if req_id not in self.active_reservations:
            return 0.0
        reserved = self.active_reservations.pop(req_id)
        actual_consumed = prompt_tokens + actual_completion
        refund = reserved - actual_consumed
        if refund > 0:
            self.current_tokens = min(self.capacity, self.current_tokens + refund)
        elif refund < 0:
            # Over-consumed: deduct excess
            self.current_tokens = max(0.0, self.current_tokens + refund)
        return refund


# ==============================================================================
# 3. Streaming Backpressure & Zombie Detection Simulator
# ==============================================================================

class StreamingSession:
    def __init__(self, req_id: str, buffer_limit_bytes: int = 65536, stall_timeout_s: float = 15.0):
        self.req_id = req_id
        self.buffer_limit = buffer_limit_bytes
        self.stall_timeout = stall_timeout_s
        self.client_buffer_bytes = 0
        self.is_aborted = False
        self.last_client_ack_time = 0.0
        self.gpu_kv_freed = False

    def push_chunk(self, chunk_bytes: int, now: float) -> bool:
        """
        Returns True if downstream accepts chunk.
        If buffer is full, triggers backpressure.
        If client stalled beyond timeout while under backpressure, aborts session.
        """
        if self.is_aborted:
            return False

        is_buffer_full = (self.client_buffer_bytes + chunk_bytes > self.buffer_limit)

        if is_buffer_full:
            if now - self.last_client_ack_time > self.stall_timeout:
                self.abort("Client stalled / zero window timeout under backpressure")
                return False
            # Backpressure: cannot take more until client consumes
            return False

        self.client_buffer_bytes += chunk_bytes
        return True

    def client_ack(self, consumed_bytes: int, now: float):
        self.client_buffer_bytes = max(0, self.client_buffer_bytes - consumed_bytes)
        self.last_client_ack_time = now

    def abort(self, reason: str):
        self.is_aborted = True
        self.gpu_kv_freed = True


# ==============================================================================
# Test Suite
# ==============================================================================

def run_tests():
    print("=== [Test 1: Prefix-Aware Routing vs Round-Robin] ===")
    # 4 GPU nodes
    nodes_rr = [GPUNode(i) for i in range(4)]
    nodes_ca = [GPUNode(i) for i in range(4)]

    # 3 distinct agent workflows with shared prefixes
    # Workflow A: 32 blocks system prompt (512 tokens)
    prefix_A = [f"sys_A_blk_{i}" for i in range(32)]
    # Workflow B: 64 blocks system prompt (1024 tokens)
    prefix_B = [f"sys_B_blk_{i}" for i in range(64)]
    # Workflow C: 16 blocks system prompt (256 tokens)
    prefix_C = [f"sys_C_blk_{i}" for i in range(16)]

    # Workloads: 300 requests alternating between Workflow A, B, C with dynamic user queries
    router_ca = LLMGatewayRouter(nodes_ca, alpha=1.0, beta=0.2)

    total_requests = 300
    rr_computed_tokens = 0
    ca_computed_tokens = 0

    for idx in range(total_requests):
        wf = idx % 3
        if wf == 0:
            prompt = prefix_A + [f"query_A_{idx}_{j}" for j in range(8)]
        elif wf == 1:
            prompt = prefix_B + [f"query_B_{idx}_{j}" for j in range(8)]
        else:
            prompt = prefix_C + [f"query_C_{idx}_{j}" for j in range(8)]

        # 1. Round-Robin
        node_rr = nodes_rr[idx % 4]
        _, comp_rr = node_rr.admit_request(prompt)
        rr_computed_tokens += comp_rr

        # 2. Cache-Aware
        node_ca = router_ca.route_cache_aware(prompt)
        _, comp_ca = node_ca.admit_request(prompt)
        ca_computed_tokens += comp_ca

    total_tokens_sent = sum((32+8 if i%3==0 else (64+8 if i%3==1 else 16+8)) * 16 for i in range(total_requests))
    rr_hit_rate = 1.0 - (rr_computed_tokens / total_tokens_sent)
    ca_hit_rate = 1.0 - (ca_computed_tokens / total_tokens_sent)

    print(f"Total Sent Tokens: {total_tokens_sent}")
    print(f"Round-Robin: Computed Prefill={rr_computed_tokens}, Hit Rate={rr_hit_rate*100:.2f}%")
    print(f"Cache-Aware: Computed Prefill={ca_computed_tokens}, Hit Rate={ca_hit_rate*100:.2f}%")

    assert ca_hit_rate > rr_hit_rate, "Cache-aware hit rate must exceed round-robin!"
    assert ca_hit_rate > 0.70, f"Cache-aware hit rate should be > 70%, got {ca_hit_rate*100:.2f}%"
    print("✓ Test 1 Passed: Prefix-aware routing cuts prefill compute drastically.\n")

    print("=== [Test 2: Two-Phase Token Rate Limiter & Reconcile] ===")
    # Bucket capacity: 10,000 tokens, refill: 1,000 tokens/sec
    limiter = TwoPhaseTokenBucket(capacity=10000, refill_rate_per_sec=1000.0)

    # Request 1: prompt 2000, estimated max 4000 (total reserve 6000)
    accepted_1 = limiter.reserve("req_1", prompt_tokens=2000, estimated_completion=4000, now=0.0)
    assert accepted_1 is True, "Req 1 should be reserved"
    assert limiter.current_tokens == 4000.0, f"Expected 4000 tokens left, got {limiter.current_tokens}"

    # Request 2: prompt 3000, estimated 3000 (total 6000) -> should be rejected!
    accepted_2 = limiter.reserve("req_2", prompt_tokens=3000, estimated_completion=3000, now=0.0)
    assert accepted_2 is False, "Req 2 must be rejected due to insufficient tokens"

    # Req 1 finishes early! Actual completion was only 500 tokens instead of 4000.
    refund = limiter.reconcile("req_1", prompt_tokens=2000, actual_completion=500, now=1.0)
    # Expected refund: 4000 - 500 = 3500 tokens. Refill over 1 sec = 1000 tokens.
    # Total tokens = 4000 + 1000 (refill) + 3500 (refund) = 8500
    assert refund == 3500.0, f"Expected 3500 refund, got {refund}"
    assert math.isclose(limiter.current_tokens, 8500.0), f"Expected 8500, got {limiter.current_tokens}"

    # Now Request 2 retries at now=1.0 and should succeed!
    accepted_2_retry = limiter.reserve("req_2", prompt_tokens=3000, estimated_completion=3000, now=1.0)
    assert accepted_2_retry is True, "Req 2 retry should succeed after refund"
    print("✓ Test 2 Passed: Two-phase token reservation and accurate reconciliation.\n")

    print("=== [Test 3: SSE Streaming Backpressure & Zombie Abort] ===")
    session = StreamingSession("req_3", buffer_limit_bytes=4096, stall_timeout_s=10.0)

    # Send chunks
    assert session.push_chunk(2048, now=0.0) is True
    assert session.push_chunk(2048, now=1.0) is True
    # Buffer is now 4096 (full)
    assert session.push_chunk(1024, now=2.0) is False, "Should backpressure when buffer full"

    # Client consumes 2048 at now=3.0
    session.client_ack(2048, now=3.0)
    assert session.push_chunk(1024, now=3.1) is True, "Should accept chunk after client ack"

    # Client completely stalls and doesn't ACK. Time passes to 15.0 (> 10s stall timeout)
    # Fill buffer to capacity (3072 + 1024 = 4096)
    assert session.push_chunk(1024, now=3.2) is True
    # Next push exceeds buffer and exceeds stall timeout -> triggers abort
    pushed = session.push_chunk(512, now=14.0)
    assert pushed is False
    assert session.is_aborted is True, "Session must be aborted due to stall timeout"
    assert session.gpu_kv_freed is True, "GPU KV cache must be reclaimed immediately"
    print("✓ Test 3 Passed: Streaming backpressure and zombie connection abort verified.\n")

    print("ALL TESTS PASSED SUCCESSFULLY.")

if __name__ == "__main__":
    run_tests()
