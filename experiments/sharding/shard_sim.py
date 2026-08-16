#!/usr/bin/env python3
"""Simulate shard-key hotspots, data skew, and expansion migration volume.

Deterministic: fixed key sets and fixed-seed tenant volumes, no third-party deps.
The 3->4 modulo / consistent-hash blocks reuse the SAME keys and node names as
experiments/consistent-hashing-boundary/consistent_hash.py, so this article and
the consistent-hashing article reproduce each other's numbers (74.828% / 14.553%).

Run:  python3 experiments/sharding/shard_sim.py
"""

import hashlib
import random
from collections import Counter

KEY_COUNT = 100_000


def h(value: str) -> int:
    """md5 first-8-hex -> int. Identical to the consistent-hashing article."""
    return int(hashlib.md5(value.encode("utf-8")).hexdigest()[:8], 16)


def modulo_locate(key: str, node_count: int) -> int:
    return h(key) % node_count


def ch_ring(node_count: int) -> list[tuple[int, str]]:
    return sorted((h(f"N{i}"), f"N{i}") for i in range(node_count))


def ch_locate(key: str, ring: list[tuple[int, str]]) -> str:
    v = h(key)
    for pos, name in ring:
        if pos >= v:
            return name
    return ring[0][1]


def moved_fraction(keys, old_of, new_of) -> float:
    return sum(1 for k in keys if old_of(k) != new_of(k)) / len(keys)


def main() -> None:
    keys = [f"key-{i:06d}" for i in range(KEY_COUNT)]

    # ---- Part 1: shard-key hotspots ----
    # 1a. range-shard by auto-increment id: every new id lands on the last shard.
    total = 400_000
    per = total // 4
    range_counts = Counter((i - 1) // per for i in range(1, total + 1))
    print("[1a] range-shard by auto-increment id, 400000 ids / 4 shards")
    print(f"     per-shard row counts: {[range_counts[s] for s in range(4)]}")
    print(f"     newest 100000 ids all -> shard 3 (100% of new writes on one shard)")

    # 1b. time-range sharding: writes concentrate on the current month.
    random.seed(20260816)
    monthly = [30_000 + 8_000 * m for m in range(12)]  # linear business growth
    total_month = sum(monthly)
    print("[1b] time-range sharding, 12 monthly shards, growing monthly volume")
    print(f"     monthly write counts: {monthly}")
    print(f"     last-month share of all writes: {monthly[-1]/total_month:.1%}")
    print(f"     last/first month write ratio: {monthly[-1]/monthly[0]:.1f}x")

    # 1c. one hot key: even under uniform %N a single key's 10000 hits go to one shard.
    hot_shard = h("user-celebrity") % 4
    print(f"[1c] hot key 'user-celebrity': 10000 hits -> shard {hot_shard} only")

    # ---- Part 2: data skew from a few big tenants ----
    random.seed(20260816)
    tenants = [f"tenant-{i:04d}" for i in range(400)]
    volumes = [int(50_000 * (0.8 ** i)) for i in range(400)]
    volumes = [v if v > 1 else 1 for v in volumes]  # biggest tenant ~20% of all rows
    shard_rows = Counter()
    for t, v in zip(tenants, volumes):
        shard_rows[h(t) % 4] += v
    rows = [shard_rows[s] for s in range(4)]
    print("[2] data skew: 400 Pareto tenants (top tenant ~20% of rows) / 4 shards")
    print(f"     per-shard rows: {rows}")
    print(f"     max/min shard row ratio: {max(rows)/min(rows):.2f}")

    # ---- Part 3: expansion migration volume ----
    moved_3to4 = moved_fraction(keys, lambda k: modulo_locate(k, 3),
                                lambda k: modulo_locate(k, 4))
    moved_4to5 = moved_fraction(keys, lambda k: modulo_locate(k, 4),
                                lambda k: modulo_locate(k, 5))
    moved_4to8 = moved_fraction(keys, lambda k: modulo_locate(k, 4),
                                lambda k: modulo_locate(k, 8))
    ring4, ring5 = ch_ring(4), ch_ring(5)
    moved_ch4to5 = moved_fraction(keys, lambda k: ch_locate(k, ring4),
                                  lambda k: ch_locate(k, ring5))
    print("[3] expansion migration volume, 100000 keys")
    print(f"     modulo 3->4: {moved_3to4:.3%}")
    print(f"     modulo 4->5: {moved_4to5:.3%}")
    print(f"     modulo 4->8 (doubling): {moved_4to8:.3%}")
    print(f"     consistent-hash 4->5: {moved_ch4to5:.3%}")


if __name__ == "__main__":
    main()
