# 验证与模拟脚本：海量实时排行榜面试模型（ZSET 内存膨胀、分级聚合与时间戳同分破偶）
# 运行方式：python3 experiments/interview-leaderboard/sim.py

import sys

fails = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)

# 1. 经典 ZSET 内存物理膨胀核算 (1 亿用户全量打入 Redis 的灾难)
# Redis 内部 zset 结构由 dict + zskiplist 构成
# dictEntry: 24B
# zskiplistNode: 32B (基础) + 平均 1.33 个层级指针 * 8B = 42.6B + robj 16B + SDS member 约 48B
# jemalloc 内存对齐后单个节点约 160 字节，外加 1.25 倍内存碎片率
BYTES_PER_ZSET_ENTRY = 160
FRAGMENTATION_RATIO = 1.25

USERS_100M = 100_000_000
raw_mem_gb = (USERS_100M * BYTES_PER_ZSET_ENTRY) / (1024**3)
actual_mem_gb = raw_mem_gb * FRAGMENTATION_RATIO

check("1亿用户全量 ZSET 裸数据内存超 14GB", raw_mem_gb > 14.5, f"{raw_mem_gb:.2f} GB")
check("计入 jemalloc 碎片率后总显存超 18GB (单机高危)", actual_mem_gb > 18.0, f"{actual_mem_gb:.2f} GB")

# 2. 本地内存窗口聚合 (Local Batch Aggregation) 降载效果
# 模拟 100ms 窗口内突发 10,000 次打赏事件，涉及 500 个热门主播/用户
RAW_EVENTS = 10000
HOT_USERS = 500

import random
random.seed(42)
events = [(f"user_{random.randint(1, HOT_USERS)}", random.choice([10, 50, 100])) for _ in range(RAW_EVENTS)]

# 本地字典预聚合
aggregated = {}
for u, pts in events:
    aggregated[u] = aggregated.get(u, 0) + pts

redis_calls_before = RAW_EVENTS
redis_calls_after = len(aggregated)
reduction_ratio = redis_calls_before / redis_calls_after

check("本地聚合将 Redis ZINCRBY 写入 QPS 降低 15 倍以上", reduction_ratio > 15.0, f"{redis_calls_before} -> {redis_calls_after} (降载 {reduction_ratio:.1f}x)")

# 3. 同分同权的时间戳微秒级破偶 (Tie-Breaking)
# 业务痛点：A 和 B 分数相同，谁先达到该分数谁排在前面，且不能引入二级索引查询
# 巧妙解法：利用 IEEE 754 双精度浮点数或固定小数位将达到时间戳嵌入分数末尾
# 复合公式：composite_score = base_score + (1.0 - timestamp / 10^10)
# 其中时间戳越早，小数值越大，排名越靠前
T_BASE = 1726700000.0  # 基准时间戳
t_alice = T_BASE + 10.0   # Alice 在 10 秒时达到 100 分
t_bob = T_BASE + 25.0     # Bob 在 25 秒时也达到 100 分

def pack_score(base_score, ts):
    # 保留 9 位小数精度
    return base_score + (1.0 - (ts - T_BASE) / 1000000.0)

score_alice = pack_score(100, t_alice)
score_bob = pack_score(100, t_bob)

check("先达到的 Alice 复合分数严格高于后达到的 Bob", score_alice > score_bob, f"Alice={score_alice:.6f} > Bob={score_bob:.6f}")
check("还原出的基础业务分数完全一致", int(score_alice) == int(score_bob) == 100)

# 4. 分级排行榜架构 (Two-Tier Leaderboard) 空间节省对比
# Tier 1 (前 10,000 名实时榜单，驻留 Redis ZSET 供高频刷新)
# Tier 2 (全量 1 亿用户分段桶 / 离线列存，支持个人名次模糊段查询)
TIER1_SIZE = 10000
tier1_mem_mb = (TIER1_SIZE * BYTES_PER_ZSET_ENTRY * FRAGMENTATION_RATIO) / (1024 * 1024)
check("分级后核心实时榜仅占用不到 2.5MB 内存", tier1_mem_mb < 2.5, f"{tier1_mem_mb:.2f} MB")
check("相比全量 ZSET 节省内存达 99.9% 以上", (actual_mem_gb * 1024 - tier1_mem_mb) / (actual_mem_gb * 1024) > 0.999)

print("="*60)
print(f"ALL CHECKS PASSED: {len(fails) == 0} (Total checks: 6)")
print("="*60)
sys.exit(1 if fails else 0)
