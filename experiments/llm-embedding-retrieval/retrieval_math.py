"""
检索数学实验:不依赖真实 embedding 模型,用可控的合成向量回答三个问题:
1. 高维空间中,余弦相似度的"有意义"范围是什么?维度灾难如何稀释判别力?
2. 归一化(单位向量)之后点积 = 余弦,排序不变?什么时候会变?
3. 分块策略:块大小与重叠对"检索召回"的模拟影响(用主题混合向量模拟文档块)。

结论仅限本合成设置,不代表任何真实 embedding 模型行为。
"""
import numpy as np

rng = np.random.default_rng(42)

def cos(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

# ---- 实验 1:高维正交性与余弦分布 ----
print("== 实验 1:随机向量的余弦分布(维度灾难)==")
for d in [8, 64, 1024]:
    pairs = 200_000
    a = rng.standard_normal((pairs, d))
    b = rng.standard_normal((pairs, d))
    c = np.einsum("ij,ij->i", a, b) / (
        np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1)
    )
    print(f"d={d:<5} 随机对余弦: mean={c.mean():+.4f} std={c.std():.4f} max={c.max():+.3f}")

# ---- 实验 2:归一化与排序一致性 ----
print("\n== 实验 2:归一化必要性(点积 vs 余弦排序)==")
d = 64
q = rng.standard_normal(d)
# 构造 5 个文档:向量长度故意不同(模拟文本长度不同)
docs = []
for scale in [3.0, 2.5, 2.0, 1.5, 1.0]:
    v = q + rng.standard_normal(d) * 0.5  # 都与 q 相关
    docs.append(v * scale)
for i, v in enumerate(docs):
    print(f"doc{i}: |v|={np.linalg.norm(v):5.2f} 点积={np.dot(q, v):+7.3f} 余弦={cos(q, v):+.3f}")
order_dot = np.argsort([-np.dot(q, v) for v in docs])
order_cos = np.argsort([-cos(q, v) for v in docs])
print(f"按点积排序: {order_dot}  按余弦排序: {order_cos}  一致: {list(order_dot)==list(order_cos)}")

# ---- 实验 3:分块策略模拟 ----
print("\n== 实验 3:块大小与重叠对召回的影响(合成主题向量)==")
# 模拟:知识库 200 个事实,每条事实是一个"主题",被编码为一个向量方向
TOPICS = 200
topics = rng.standard_normal((TOPICS, d))
topics /= np.linalg.norm(topics, axis=1, keepdims=True)

def chunk_recall(doc_topics, q_topic, chunk_size, overlap, noise=0.15):
    """把 doc_topics 序列切成块,每块向量=块内平均+噪声,查 q 在 top-k 块里是否命中。
    Returns: 是否命中 top-1, top-3"""
    chunks = []
    contains_q = []
    n = len(doc_topics)
    step = max(1, chunk_size - overlap)
    for start in range(0, n, step):
        ids = doc_topics[start : start + chunk_size]
        c = topics[ids].mean(axis=0)
        c = c + rng.standard_normal(d) * noise
        chunks.append(c)
        contains_q.append(q_idx in ids)
    if not chunks:
        return False, False
    sims = [cos(q_topic, c) for c in chunks]
    best = np.argsort(-np.asarray(sims))
    hit_positions = [pos for pos, block in enumerate(best) if contains_q[block]]
    if not hit_positions:
        return False, False
    return hit_positions[0] == 0, hit_positions[0] < 3

# 场景:查询主题在第 100 位(中间),文档是 200 个主题的连续序列
doc_topics = np.arange(TOPICS)
q_idx = 100
rng2 = np.random.default_rng(7)

print(f"{'块大小':>6} {'重叠':>4} | 块数 | top-1 命中/20 | top-3 命中/20")
for chunk_size, overlap in [(1, 0), (5, 0), (5, 2), (10, 0), (10, 5), (20, 0), (20, 10), (50, 0), (200, 0)]:
    hit1 = hit3 = 0
    for _ in range(20):
        h1, h3 = chunk_recall(doc_topics, topics[q_idx], chunk_size, overlap)
        hit1 += h1; hit3 += h3
    n_chunks = int(np.ceil((TOPICS - chunk_size) / max(1, chunk_size - overlap))) + 1 if chunk_size < TOPICS else 1
    print(f"{chunk_size:>6} {overlap:>5} | {n_chunks:>4} | {hit1:>10}/20 | {hit3:>10}/20")