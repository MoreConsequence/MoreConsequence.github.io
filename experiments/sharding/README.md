# sharding：分片键热点、数据倾斜与扩容搬迁模拟

确定性 Python 3 脚本，无第三方依赖，配套文章
`content/posts/sharding-partition-key-migration.md`。

## 运行

```bash
cd experiments/sharding
python3 shard_sim.py
```

## 它模拟什么

- Part 1：三类分片键错误——自增 ID 区间分片的尾部写入热点、按时间分片的当月集中写入、单热 key 打爆单片；
- Part 2：帕累托租户按租户哈希分片后的片间数据倾斜（max/min 行数比）；
- Part 3：扩容搬迁比例——取模 3→4、取模 4→5、幂等翻倍 4→8、一致性哈希 4→5。

## 与上一篇实验的一致性

Part 3 的 `3->4` 取模与一致性哈希复用
`experiments/consistent-hashing-boundary/consistent_hash.py` 的 key 生成
（`key-%06d`）与节点命名（`N0..N3`），因此两篇文章应复现同一组数字：
取模 3→4 ≈ 74.828%，一致性哈希 3→4 ≈ 14.553%（环位置相关，非承诺值）。

## 记录

运行后把输出回填文章正文的【本机实测待补】处，并参照
`evidence/consistent-hashing-minimal-remap/2026-08-16-local/` 的格式记录
机器、Python 版本与完整原始输出。
