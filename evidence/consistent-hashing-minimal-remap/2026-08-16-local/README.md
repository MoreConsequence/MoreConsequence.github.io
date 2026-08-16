# consistent-hashing-minimal-remap：本机证据

## 命令

```bash
python3 experiments/consistent-hashing-boundary/consistent_hash.py
```

输入固定为 `key-000000` 到 `key-099999`，旧节点为 `N0..N2`，新节点为 `N0..N3`，哈希函数是 MD5 截取前 32 位。脚本同时计算环和 `hash % node_count` 的重映射数量。

## 解释边界

- `1/(N+1)` 是节点哈希位置均匀时的平均期望，不是每次增节点的精确比例。
- 本次只有 3 个物理节点，新增节点在环上的具体区间会造成明显位置方差；14.553% 只绑定这组节点名和 key 输入。
- 该脚本没有模拟缓存回源、热 key、复制一致性、节点故障或 vnode；它只验证重映射这一层。
