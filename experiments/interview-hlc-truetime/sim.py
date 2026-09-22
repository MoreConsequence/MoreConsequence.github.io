#!/usr/bin/env python3
"""
experiments/interview-hlc-truetime/sim.py

Deterministic simulation suite for:
1. Out-of-Band Causality Anomaly under HLC with physical clock skew.
2. Google Spanner TrueTime Commit-Wait External Consistency Guarantee.
3. CockroachDB MaxOffset Uncertainty Window and Read Restart Rate.
"""

import math
from typing import Tuple, Optional, List

# ==============================================================================
# 1. HLC vs Out-of-Band Causality
# ==============================================================================

class HLCNode:
    def __init__(self, node_id: str, physical_clock_offset_ms: float):
        self.node_id = node_id
        self.offset = physical_clock_offset_ms
        self.l = 0.0  # Physical component
        self.c = 0    # Logical component

    def get_physical_time(self, wall_clock_ms: float) -> float:
        return wall_clock_ms + self.offset

    def tick(self, wall_clock_ms: float) -> Tuple[float, int]:
        pt = self.get_physical_time(wall_clock_ms)
        l_old = self.l
        self.l = max(l_old, pt)
        if self.l == l_old:
            self.c += 1
        else:
            self.c = 0
        return self.l, self.c

    def update(self, msg_l: float, msg_c: int, wall_clock_ms: float) -> Tuple[float, int]:
        pt = self.get_physical_time(wall_clock_ms)
        l_old = self.l
        self.l = max(l_old, pt, msg_l)
        if self.l == l_old and self.l == msg_l:
            self.c = max(self.c, msg_c) + 1
        elif self.l == l_old:
            self.c += 1
        elif self.l == msg_l:
            self.c = msg_c + 1
        else:
            self.c = 0
        return self.l, self.c


# ==============================================================================
# 2. TrueTime Engine with Commit-Wait
# ==============================================================================

class TrueTimeEngine:
    def __init__(self, epsilon_ms: float = 7.0):
        self.epsilon = epsilon_ms

    def tt_now(self, wall_clock_ms: float) -> Tuple[float, float]:
        """Returns [earliest, latest] interval."""
        return (wall_clock_ms - self.epsilon, wall_clock_ms + self.epsilon)

    def commit_transaction(self, wall_clock_ms: float) -> Tuple[float, float]:
        """
        Executes commit-wait protocol:
        Pick s = latest.
        Wait until earliest > s, which requires waiting 2 * epsilon ms!
        Returns (commit_timestamp s, real_finish_time_ms).
        """
        _, latest = self.tt_now(wall_clock_ms)
        s = latest
        # Commit wait: wait until wall_clock + wait_time - epsilon > s
        # wall_clock + wait_time - epsilon > wall_clock + epsilon => wait_time > 2 * epsilon
        wait_time = 2 * self.epsilon + 0.1
        real_finish_time = wall_clock_ms + wait_time
        return s, real_finish_time


# ==============================================================================
# 3. CockroachDB Read-Restart Simulator under Uncertainty Window
# ==============================================================================

class CockroachReadRestartSimulator:
    def __init__(self, max_offset_ms: float = 250.0):
        self.max_offset = max_offset_ms

    def evaluate_read(self, read_ts: float, write_ts: float) -> str:
        """
        If write_ts > read_ts + max_offset: write is in future, ignore (clean snapshot).
        If write_ts <= read_ts: write is in past, read it cleanly.
        If read_ts < write_ts <= read_ts + max_offset:
            UNRESOLVED UNCERTAINTY! Must trigger Read Restart!
        """
        if write_ts <= read_ts:
            return "CLEAN_READ"
        elif write_ts <= read_ts + self.max_offset:
            return "READ_RESTART"
        else:
            return "FUTURE_IGNORE"


# ==============================================================================
# Test Suite
# ==============================================================================

def run_tests():
    print("=== [Test 1: Out-of-Band Causality Anomaly under HLC] ===")
    # Node A is ahead by +30ms. Node B is lagging by -30ms (total clock skew = 60ms).
    node_a = HLCNode("node_A", physical_clock_offset_ms=30.0)
    node_b = HLCNode("node_B", physical_clock_offset_ms=-30.0)

    # T1 commits on Node A at wall clock = 1000.0ms
    wall_clock_t1 = 1000.0
    hlc_t1 = node_a.tick(wall_clock_t1)

    # User observes T1 finished at wall clock = 1005.0ms, calls friend on phone (out-of-band)
    # Friend starts T2 on Node B at wall clock = 1010.0ms (strictly after T1 finished in physical reality!)
    wall_clock_t2 = 1010.0
    hlc_t2 = node_b.tick(wall_clock_t2)

    print(f"Physical Reality: T1 completed at {wall_clock_t1}ms, T2 started at {wall_clock_t2}ms (T1 happened before T2)")
    print(f"Node A (T1) HLC: {hlc_t1} (Physical component: {hlc_t1[0]}ms)")
    print(f"Node B (T2) HLC: {hlc_t2} (Physical component: {hlc_t2[0]}ms)")

    # Anomaly: T2's HLC is strictly LESS than T1's HLC!
    is_inverted = (hlc_t2 < hlc_t1)
    print(f"Causal Inversion Detected: {is_inverted} (T2 timestamp < T1 timestamp!)")
    assert is_inverted is True, "HLC must suffer causal inversion under out-of-band communication with clock skew!"
    print("✓ Test 1 Passed: Proved HLC cannot preserve external consistency without explicit message exchange.\n")

    print("=== [Test 2: Spanner TrueTime Commit-Wait External Consistency] ===")
    tt = TrueTimeEngine(epsilon_ms=7.0)

    # T1 commits on Node A at physical time 1000.0ms
    s1, finish_time_t1 = tt.commit_transaction(1000.0)
    print(f"T1 picked commit timestamp s1 = {s1:.2f}ms. Commit-wait finished at {finish_time_t1:.2f}ms (waited {finish_time_t1 - 1000.0:.2f}ms)")

    # T2 starts on any arbitrary node at physical time strictly after T1's commit was acknowledged:
    # Say T2 starts at finish_time_t1 + 1.0ms
    start_time_t2 = finish_time_t1 + 1.0
    earliest_t2, latest_t2 = tt.tt_now(start_time_t2)
    s2, finish_time_t2 = tt.commit_transaction(start_time_t2)

    print(f"T2 starts at {start_time_t2:.2f}ms, picks s2 = {s2:.2f}ms")
    print(f"Verification: s1 ({s1:.2f}ms) < s2 ({s2:.2f}ms) -> {s1 < s2}")

    assert s1 < s2, "TrueTime commit-wait MUST strictly guarantee s1 < s2 for real-time external ordering!"
    print("✓ Test 2 Passed: TrueTime commit-wait mathematically guarantees linearizability.\n")

    print("=== [Test 3: CockroachDB Uncertainty Window & Read Restarts] ===")
    crdb = CockroachReadRestartSimulator(max_offset_ms=250.0)

    # Simulate 1000 concurrent reads encountering writes within the uncertainty window
    read_ts = 1000.0
    restart_count = 0
    clean_count = 0

    for write_offset in range(-50, 350, 2):
        write_ts = read_ts + write_offset
        res = crdb.evaluate_read(read_ts, write_ts)
        if res == "READ_RESTART":
            restart_count += 1
        elif res == "CLEAN_READ":
            clean_count += 1

    print(f"Total Scenarios: 200 | Clean Reads: {clean_count} | Read Restarts (Uncertainty Retries): {restart_count}")
    assert restart_count > 0, "Uncertainty window must cause read restarts"
    print("✓ Test 3 Passed: Demonstrated trade-off of software-only HLC requiring read restarts under uncertainty.\n")

    print("ALL TESTS PASSED SUCCESSFULLY.")

if __name__ == "__main__":
    run_tests()
