#!/usr/bin/env python3
"""
experiments/interview-gpu-cluster/sim.py

Deterministic simulation suite for:
1. Gang Scheduling vs Greedy Allocation Deadlock.
2. NCCL Ring AllReduce Straggler Bottleneck Propagation.
3. Effective Goodput Model: Synchronous Checkpointing vs 3-Stage Async Checkpointing.
"""

import math
from typing import List, Dict, Tuple, Optional

# ==============================================================================
# 1. Gang Scheduler vs Greedy Allocation Deadlock Simulator
# ==============================================================================

class ClusterGPUResource:
    def __init__(self, total_gpus: int = 12):
        self.total_gpus = total_gpus
        self.allocated_gpus = 0

    def allocate(self, count: int) -> bool:
        if self.total_gpus - self.allocated_gpus >= count:
            self.allocated_gpus += count
            return True
        return False

    def release(self, count: int):
        self.allocated_gpus = max(0, self.allocated_gpus - count)


def simulate_greedy_scheduling() -> str:
    """
    Two jobs A and B both need 8 GPUs. Total cluster capacity = 12.
    Greedy scheduler grants partial requests:
    - Job A gets 6 GPUs (needs 2 more)
    - Job B gets 6 GPUs (needs 2 more)
    Result: DEADLOCK! Neither job can run.
    """
    cluster = ClusterGPUResource(total_gpus=12)
    # Greedy allocation of available chunks
    job_a_held = 6
    cluster.allocate(job_a_held)
    job_b_held = 6
    cluster.allocate(job_b_held)

    # Job A tries to get remaining 2
    a_can_proceed = cluster.allocate(2)
    b_can_proceed = cluster.allocate(2)

    if not a_can_proceed and not b_can_proceed:
        return "DEADLOCK"
    return "SUCCESS"


def simulate_gang_scheduling() -> str:
    """
    Gang scheduler: All-or-Nothing.
    Job A requests 8 GPUs: cluster has 12 -> Job A gets all 8, starts execution!
    Job B requests 8 GPUs: cluster has 4 left -> Job B is queued, does not grab partial GPUs!
    Cluster is not deadlocked, Job A completes, releases 8 GPUs, then Job B runs!
    """
    cluster = ClusterGPUResource(total_gpus=12)
    job_a_request = 8
    job_b_request = 8

    # Job A gang-scheduled
    a_success = cluster.allocate(job_a_request)
    # Job B gang-scheduled
    b_success = cluster.allocate(job_b_request)

    assert a_success is True, "Job A should be granted full quota"
    assert b_success is False, "Job B should be queued cleanly without grabbing partial quota"
    assert cluster.allocated_gpus == 8, "Only 8 GPUs held by Job A"

    # Job A finishes and releases
    cluster.release(job_a_request)
    # Job B now gets scheduled
    b_retry = cluster.allocate(job_b_request)
    assert b_retry is True, "Job B successfully runs after Job A completes"
    return "SUCCESS"


# ==============================================================================
# 2. NCCL Ring AllReduce Straggler Bottleneck Model
# ==============================================================================

def simulate_ring_allreduce(num_gpus: int, base_chunk_transfer_ms: float, straggler_factor: float = 1.0) -> float:
    """
    In Ring AllReduce with N GPUs, the ring has 2*(N-1) steps (Scatter-Reduce + AllGather).
    In each step, each GPU sends data to its neighbor and receives from its predecessor.
    Because every step is synchronous across the ring, the duration of each step is
    governed by the SLOWEST GPU in the ring:
    Step_Time = max(GPU_transfer_times).
    """
    # 1 GPU is a straggler if straggler_factor > 1.0
    slowest_step = base_chunk_transfer_ms * straggler_factor
    total_time_ms = 2 * (num_gpus - 1) * slowest_step
    return total_time_ms


# ==============================================================================
# 3. Effective Goodput Model: Sync vs Async Checkpointing
# ==============================================================================

def calculate_training_goodput(
    mtbf_hours: float,
    checkpoint_interval_hours: float,
    checkpoint_freeze_time_sec: float,
    recovery_overhead_sec: float
) -> float:
    """
    Goodput = Useful Training Time / Total Wall Clock Time.
    Total time over an MTBF cycle:
    1. Training segments between checkpoints
    2. Checkpoint freeze times
    3. Failure occurs on average at MTBF/2 into the interval
    4. Recovery overhead + redoing lost work since last checkpoint
    """
    mtbf_sec = mtbf_hours * 3600.0
    interval_sec = checkpoint_interval_hours * 3600.0

    num_checkpoints_per_mtbf = mtbf_sec / interval_sec
    total_freeze_sec = num_checkpoints_per_mtbf * checkpoint_freeze_time_sec

    # Lost training time on failure = half of the checkpoint interval on average
    lost_work_sec = interval_sec / 2.0
    total_unproductive_sec = total_freeze_sec + recovery_overhead_sec + lost_work_sec

    useful_training_sec = mtbf_sec - lost_work_sec
    total_wall_clock_sec = mtbf_sec + total_freeze_sec + recovery_overhead_sec

    goodput = useful_training_sec / total_wall_clock_sec
    return goodput


# ==============================================================================
# Test Suite
# ==============================================================================

def run_tests():
    print("=== [Test 1: Gang Scheduling vs Greedy Allocation Deadlock] ===")
    greedy_res = simulate_greedy_scheduling()
    gang_res = simulate_gang_scheduling()

    print(f"Greedy Scheduler Result: {greedy_res} (Resource starvation / deadlock)")
    print(f"Gang Scheduler Result:   {gang_res} (All-or-Nothing prevents deadlock)")

    assert greedy_res == "DEADLOCK", "Greedy scheduler must deadlock under competitive partial allocations"
    assert gang_res == "SUCCESS", "Gang scheduler must successfully run all jobs"
    print("✓ Test 1 Passed: Gang scheduling atomicity eliminates cluster deadlocks.\n")

    print("=== [Test 2: NCCL Ring AllReduce Straggler Propagation] ===")
    num_gpus = 64
    base_chunk_ms = 2.0  # 2ms per chunk transfer under 400Gbps InfiniBand

    normal_ring_time = simulate_ring_allreduce(num_gpus, base_chunk_ms, straggler_factor=1.0)
    straggled_ring_time = simulate_ring_allreduce(num_gpus, base_chunk_ms, straggler_factor=3.0)  # 1 slow GPU (e.g. PCIe degradation)

    ratio = straggled_ring_time / normal_ring_time
    print(f"Normal 64-GPU Ring AllReduce Time:     {normal_ring_time:.2f} ms")
    print(f"Ring AllReduce with 1 Slow GPU (3x):   {straggled_ring_time:.2f} ms (Slowdown: {ratio:.2f}x)")

    assert math.isclose(ratio, 3.0), "A single straggler in Ring AllReduce must slow down the entire collective operation by its exact factor"
    print("✓ Test 2 Passed: Proved Ring AllReduce strict bottleneck effect.\n")

    print("=== [Test 3: Training Goodput - Sync vs Async Checkpointing] ===")
    mtbf_hours = 3.0  # Typical for a 16,384 GPU cluster (frequent hardware/optical failures)
    checkpoint_interval_hours = 0.5  # Save checkpoint every 30 minutes
    recovery_overhead_sec = 1200.0   # 20 minutes to reallocate nodes and load weights

    # Sync Checkpoint: 15 minutes (900 seconds) GPU freeze while writing to remote storage
    goodput_sync = calculate_training_goodput(
        mtbf_hours=mtbf_hours,
        checkpoint_interval_hours=checkpoint_interval_hours,
        checkpoint_freeze_time_sec=900.0,
        recovery_overhead_sec=recovery_overhead_sec
    )

    # Async Checkpoint: 2.5 seconds GPU freeze (D2H memory snapshot), background NVMe/S3 offload
    goodput_async = calculate_training_goodput(
        mtbf_hours=mtbf_hours,
        checkpoint_interval_hours=checkpoint_interval_hours,
        checkpoint_freeze_time_sec=2.5,
        recovery_overhead_sec=recovery_overhead_sec
    )

    print(f"Sync Checkpoint (15 min freeze) Goodput:  {goodput_sync*100:.2f}%")
    print(f"Async Checkpoint (2.5s freeze) Goodput:   {goodput_async*100:.2f}%")
    print(f"Net Productivity Gain:                    +{(goodput_async - goodput_sync)*100:.2f}%")

    assert goodput_sync < 0.60, "Sync checkpoint with frequent MTBF must exhibit poor goodput (< 60%)"
    assert goodput_async > 0.80, "Async checkpoint must restore goodput to > 80%"
    print("✓ Test 3 Passed: Async checkpointing recovers over 25% of wasted cluster computing budget.\n")

    print("ALL TESTS PASSED SUCCESSFULLY.")

if __name__ == "__main__":
    run_tests()
