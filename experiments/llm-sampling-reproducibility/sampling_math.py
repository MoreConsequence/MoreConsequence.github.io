"""
采样参数几何:temperature/top-p/seed 对采样分布的作用,纯数学模拟,不依赖真实模型。

语义依据(官方文档 2026-08):
- temperature: 采样前把 logits 除以 T,T=0 退化为 greedy(argmax),不触发 RNG
- top_p: 核采样,只从累积概率达 p 的最小前缀里采样
- seed: 给采样器 RNG 置种;OpenAI 文档明示返回"mostly deterministic",
  system_fingerprint 变化会破坏可复现性
结论仅限本模拟,不代表任何真实模型。
"""
import numpy as np

rng = np.random.default_rng(20260816)
VOCAB = 50
logits = rng.standard_normal(VOCAB)
logits[0] = 3.2  # 明确的最优 token
logits[1] = 2.8  # 接近的第二
logits[2] = 1.5

def softmax(z):
    e = np.exp(z - z.max())
    return e / e.sum()

def sample_top_k_p(logits, k=None, p=None, temperature=1.0, rng=None):
    """返回被过滤后的候选概率表 + 一次采样结果。k 与 p 二选一。
    T=0 时为 argmax(无采样),RNG 永远不触发。"""
    if temperature == 0:
        return None, int(np.argmax(logits))
    t = np.array(logits) / temperature
    probs = softmax(t)
    if k is not None:
        idx = np.argsort(probs)[::-1][:k]
    elif p is not None:
        order = np.argsort(probs)[::-1]
        cum = np.cumsum(probs[order])
        keep = np.searchsorted(cum, p) + 1
        idx = order[:keep]
    else:
        idx = np.arange(VOCAB)
    filt = np.zeros_like(probs)
    filt[idx] = probs[idx]
    filt = filt / filt.sum()  # 重归一化
    return filt, rng.choice(VOCAB, p=filt) if rng else None

print("== 1. 温度缩放:同一 logits,不同形状 ==")
for t in [0.5, 1.0, 2.0]:
    p = softmax(logits / t)
    top3 = np.argsort(p)[::-1][:3]
    print(f"T={t:<4} P(token0)={p[0]:.4f} P(token1)={p[1]:.4f} P(token2)={p[2]:.4f} | top3={top3}")
print("T=0 -> argmax: token", int(np.argmax(logits)))

print("\n== 2. top-p 核采样:截掉长尾 ==")
base = softmax(logits)
for pv in [0.9, 0.95, 1.0]:
    filt, _ = sample_top_k_p(logits, p=pv, rng=None)
    kept = int((filt > 0).sum())
    print(f"p={pv:<4} 保留 {kept:>3}/{VOCAB} 个 token | token0 概率占比 {filt[0]:.4f}(原始 {base[0]:.4f})")

print("\n== 3. seed 锁定:同 seed 同序列,异 seed 不同 ==")
logits2 = logits.copy()
logits2[1] += 0.3  # 让 token1 有真实竞争
for seed in [42, 42, 7, 42]:
    r = np.random.default_rng(seed)
    seq = [sample_top_k_p(logits2, p=0.98, rng=r)[1] for _ in range(8)]
    print(f"seed={seed:<3} 采样序列: {seq}")

print("\n== 4. 温度 0 + 任意 seed:输出相同(seed 无效果) ==")
for seed in [1, 2, 3]:
    r = np.random.default_rng(seed)
    out = sample_top_k_p(logits, temperature=0.0, rng=r)
    # T=0 应走 argmax 而非采样
    print(f"seed={seed} greedy 结果: token {int(np.argmax(logits))} (采样分支永远不触发)")