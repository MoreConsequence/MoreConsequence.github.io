# 本机原始证据（2026-08-16）

文章：`content/posts/sharding-partition-key-migration.md`（draft）
实验：`experiments/sharding/shard_sim.py`

## 环境

- 机器：Mac（darwin 25.5.0）
- Python：3.x（CPython）
- 依赖：无第三方

## 命令

```bash
cd experiments/sharding
python3 shard_sim.py
```

## 原始输出

脚本为确定性输出（固定 key 集 + 固定 seed，md5/random 在 CPython 各版本稳定），
任意机器可复现；`shard_sim.py` 的 3→4 取模与一致性哈希复用
`consistent-hashing-boundary/consistent_hash.py` 的 key 与节点命名，
故 3→4 取模 74.828% 与上一篇已发布证据一致。

```
[1a] range-shard by auto-increment id, 400000 ids / 4 shards
     per-shard row counts: [100000, 100000, 100000, 100000]
     newest 100000 ids all -> shard 3 (100% of new writes on one shard)
[1b] time-range sharding, 12 monthly shards, growing monthly volume
     monthly write counts: [30000, 38000, 46000, 54000, 62000, 70000, 78000, 86000, 94000, 102000, 110000, 118000]
     last-month share of all writes: 13.3%
     last/first month write ratio: 3.9x
[1c] hot key 'user-celebrity': 10000 hits -> shard 1 only
[2] data skew: 400 Pareto tenants (top tenant ~20% of rows) / 4 shards
     per-shard rows: [65508, 24247, 102255, 58314]
     max/min shard row ratio: 4.22
[3] expansion migration volume, 100000 keys
     modulo 3->4: 74.828%
     modulo 4->5: 80.195%
     modulo 4->8 (doubling): 49.618%
     consistent-hash 4->5: 2.296%
```

## 结论回填

正文第二、四节的分布/倾斜/搬迁数字取自上方输出；一致性哈希 4→5 的 2.296%
是单一环配置（N0..N4）的单次值，远低于 20% 平均期望，用于演示环位置方差，
不能作为该算法的通用承诺。
