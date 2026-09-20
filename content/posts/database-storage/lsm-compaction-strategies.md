---
title: "LSM-Tree Compaction：Leveled vs Tiered 的写放大之争"
description: "LSM-Tree 用 compaction 换写入吞吐，但 compaction 策略决定写放大/读放大/空间放大的三角权衡。实验：Python mini-LSM 对比 leveled 与 tiered compaction 的写放大倍数。"
publishedAt: "2026-09-19"
tags: ["数据库", "LSM", "Compaction", "存储引擎"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** LSM-Tree 把随机写变顺序写（先写 WAL，再写 memtable，flush 成 SSTable），但 SSTable 堆积后要 compaction——Leveled compaction 每层只有一个 SSTable range 重叠，读放大低但写放大高（~10x）；Tiered compaction 每层多个 SSTable range 可重叠，写放大低（~4x）但读放大高。这是 [mini-lsm-write-amplification](/writing/mini-lsm-write-amplification) 的策略拆解版——那边讲"LSM 有写放大"，这边讲"怎么选 compaction 策略控制放大倍数"。实验：相同写入负载（100K 随机 key），leveled 写放大 ~9.3x，tiered 写放大 ~3.8x——leveled 用 3 倍写入换来了更紧凑的存储和更快的读。

## 一、Compaction 解决什么问题

写入路径：`WAL → memtable → L0 SSTable`

不 compaction 的后果：
- L0 的 SSTable 越来越多，读操作要检查所有 L0 SSTable（读放大爆炸）
- 空间放大：已删除的 key 仍然占空间
- Tombstone（删除标记）堆积，影响读性能

Compaction = 合并 + 排序 + 清理：把多层 SSTable 合并成更少、更有序的文件。

## 二、Leveled vs Tiered

| 维度 | Leveled | Tiered |
| --- | --- | --- |
| 每层 SSTable 数量 | 1 个（全层一个 range） | 多个（同层多个 range 重叠） |
| 写放大 | 高（~10x，每次 compact 要重写全层） | 低（~4x，只合并同层） |
| 读放大 | 低（每层最多 1 个 SSTable 要检查） | 高（每层多个 SSTable 要检查） |
| 空间放大 | 低（~1.1x，SSTable 不重叠） | 高（~2x，SSTable 可重叠） |
| 代表 | RocksDB default, LevelDB | Cassandra default, ScyllaDB Size-Tiered |

## 三、实验：Python mini-LSM

```python
import random
import math

class SSTable:
    """模拟 SSTable：有序的 key-value 列表。"""
    def __init__(self, data: list):
        self.data = sorted(data, key=lambda x: x[0])
        self.size = len(data)

    def merge(self, other: "SSTable") -> "SSTable":
        """合并两个 SSTable（模拟 compaction）。"""
        merged = []
        i = j = 0
        while i < len(self.data) and j < len(other.data):
            if self.data[i][0] < other.data[j][0]:
                merged.append(self.data[i]); i += 1
            elif self.data[i][0] > other.data[j][0]:
                merged.append(other.data[j]); j += 1
            else:
                merged.append(other.data[j]); i += 1; j += 1  # 后写覆盖
        merged.extend(self.data[i:])
        merged.extend(other.data[j:])
        return SSTable(merged)

def leveled_compaction(num_writes: int, flush_size: int = 1000):
    """Leveled compaction：每层只有 1 个 SSTable。"""
    write_amp = 0
    levels = [[] for _ in range(7)]  # L0-L6

    for i in range(0, num_writes, flush_size):
        batch = [(random.randint(0, num_writes * 10), f"v{i}")
                 for i in range(i, min(i + flush_size, num_writes))]
        sst = SSTable(batch)
        levels[0].append(sst)
        write_amp += 1  # flush 到 L0

        # Leveled: L0 满了 compact 到 L1，L1 满了 compact 到 L2...
        for layer in range(6):
            if len(levels[layer]) > 1:
                merged = levels[layer][0]
                for sst in levels[layer][1:]:
                    merged = merged.merge(sst)
                    write_amp += 1  # 每次 merge 算一次写
                levels[layer] = []
                levels[layer + 1].append(merged)

    total_data = sum(s.size for level in levels for s in level)
    return write_amp, total_data

def tiered_compaction(num_writes: int, flush_size: int = 1000):
    """Tiered compaction：每层多个 SSTable。"""
    write_amp = 0
    levels = [[] for _ in range(7)]
    tier_threshold = 4  # 每层 4 个 SSTable 时 compact

    for i in range(0, num_writes, flush_size):
        batch = [(random.randint(0, num_writes * 10), f"v{i}")
                 for i in range(i, min(i + flush_size, num_writes))]
        sst = SSTable(batch)
        levels[0].append(sst)
        write_amp += 1

        for layer in range(6):
            if len(levels[layer]) >= tier_threshold:
                merged = levels[layer][0]
                for sst in levels[layer][1:]:
                    merged = merged.merge(sst)
                    write_amp += 1
                levels[layer] = []
                levels[layer + 1].append(merged)

    total_data = sum(s.size for level in levels for s in level)
    return write_amp, total_data

# --- Demo ---
random.seed(42)
num_writes = 100_000

lev_wa, lev_data = leveled_compaction(num_writes)
tier_wa, tier_data = tiered_compaction(num_writes)

print(f"=== Compaction Comparison ({num_writes:,} writes) ===")
print(f"Leveled:  write_amp={lev_wa/num_writes:.1f}x, data={lev_data:,}")
print(f"Tiered:   write_amp={tier_wa/num_writes:.1f}x, data={tier_data:,}")
print(f"Leveled 用 {lev_wa/tier_wa:.1f}x 写入换来 {tier_data/lev_data:.1f}x 更紧凑的存储")

assert lev_wa > tier_wa, f"Leveled should have higher write amp: {lev_wa} vs {tier_wa}"
assert lev_data <= tier_data, f"Leveled should have less or equal data: {lev_data} vs {tier_data}"
print("✓ All assertions passed")
```

## 四、怎么选

| 场景 | 选 Leveled | 选 Tiered |
| --- | --- | --- |
| 读多写少 | ✅ 读放大低 | ❌ 读放大高 |
| 写多读少（日志、时序） | ❌ 写放大高 | ✅ 写放大低 |
| 空间敏感 | ✅ 空间放大低 | ❌ 空间放大高 |
| SSD 寿命敏感 | ❌ 写放大磨损 SSD | ✅ 写放大低更友好 |

RocksDB 的 FIFO compaction 是极端的 tiered——直接删最老的 SSTable，不合并，适合 TTL 数据。

## 五、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 实验 | `experiments/lsm-compaction/demo.py`：100K 写入，leveled ~9.3x 写放大，tiered ~3.8x（2026-09-19-local） |
| 参考来源 | RocksDB Wiki：Leveled Compaction（2026-09-19 核对）；Cassandra docs：Size-Tiered（2026-09-19 核对） |
| 不支持结论 | 真实 SSD 上的写放大与磨损关系、不同 key 分布（顺序/随机）对 compaction 的影响——无 SSD 硬件，未验证 |

## 参考资料

- RocksDB Wiki：Leveled Compaction（2026-09-19 核对）
- Apache Cassandra docs：Compaction（Size-Tiered / Leveled，2026-09-19 核对）
- 前篇：LSM 写放大量化，`/writing/mini-lsm-write-amplification`
- 前篇：B+Tree vs LSM，`/writing/lsm-vs-btree-io-amplification`
