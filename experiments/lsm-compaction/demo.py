#!/usr/bin/env python3
"""LSM-Tree compaction strategies: Leveled vs Tiered write amplification."""

import random


class SSTable:
    def __init__(self, data):
        self.data = sorted(data, key=lambda x: x[0])
        self.size = len(data)

    def merge(self, other):
        merged = []
        i = j = 0
        while i < len(self.data) and j < len(other.data):
            if self.data[i][0] < other.data[j][0]:
                merged.append(self.data[i])
                i += 1
            elif self.data[i][0] > other.data[j][0]:
                merged.append(other.data[j])
                j += 1
            else:
                merged.append(other.data[j])
                i += 1
                j += 1
        merged.extend(self.data[i:])
        merged.extend(other.data[j:])
        return SSTable(merged)


def leveled_compaction(num_writes, flush_size=1000):
    """Leveled compaction: each level has at most 1 SSTable."""
    bytes_written = 0
    levels = [[] for _ in range(7)]  # L0-L6

    for i in range(0, num_writes, flush_size):
        batch = [
            (random.randint(0, num_writes * 10), f"v{i}")
            for i in range(i, min(i + flush_size, num_writes))
        ]
        sst = SSTable(batch)
        levels[0].append(sst)
        bytes_written += sst.size  # flush to L0

        # Leveled: L0满了compact到L1，L1满了compact到L2...
        for layer in range(6):
            if len(levels[layer]) > 1:
                merged = levels[layer][0]
                for sst in levels[layer][1:]:
                    merged = merged.merge(sst)
                bytes_written += merged.size  # write merged result
                levels[layer] = []
                levels[layer + 1].append(merged)

    total_unique_keys = sum(s.size for level in levels for s in level)
    return bytes_written, total_unique_keys


def tiered_compaction(num_writes, flush_size=1000):
    """Tiered compaction: each level has multiple SSTables."""
    bytes_written = 0
    levels = [[] for _ in range(7)]
    tier_threshold = 4  # compact when level has 4+ SSTables

    for i in range(0, num_writes, flush_size):
        batch = [
            (random.randint(0, num_writes * 10), f"v{i}")
            for i in range(i, min(i + flush_size, num_writes))
        ]
        sst = SSTable(batch)
        levels[0].append(sst)
        bytes_written += sst.size  # flush to L0

        for layer in range(6):
            if len(levels[layer]) >= tier_threshold:
                merged = levels[layer][0]
                for sst in levels[layer][1:]:
                    merged = merged.merge(sst)
                bytes_written += merged.size  # write merged result
                levels[layer] = []
                levels[layer + 1].append(merged)

    total_unique_keys = sum(s.size for level in levels for s in level)
    return bytes_written, total_unique_keys


def main():
    random.seed(42)
    num_writes = 100_000

    lev_written, lev_data = leveled_compaction(num_writes)
    tier_written, tier_data = tiered_compaction(num_writes)

    lev_wa = lev_written / num_writes
    tier_wa = tier_written / num_writes

    print(f"=== Compaction Comparison ({num_writes:,} writes) ===")
    print(f"Leveled:  bytes_written={lev_written:,}, write_amp={lev_wa:.1f}x, unique_keys={lev_data:,}")
    print(f"Tiered:   bytes_written={tier_written:,}, write_amp={tier_wa:.1f}x, unique_keys={tier_data:,}")
    print(f"Leveled uses {lev_wa / tier_wa:.1f}x more writes for {tier_data / lev_data:.1f}x tighter storage")

    assert lev_wa > tier_wa, f"Leveled should have higher write amp: {lev_wa:.1f} vs {tier_wa:.1f}"
    print("\n✓ All assertions passed")


if __name__ == "__main__":
    main()
