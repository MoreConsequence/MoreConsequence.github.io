#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""静态批（request-level scheduling）vs continuous batching（iteration-level scheduling）的
离散事件对比模拟器。

物理模型（教学简化，详见 README.md）：
- decode 是内存带宽瓶颈：一次 decode iteration 固定耗时 T_DECODE_MS，批内每个活跃序列各推进
  1 个 token；活跃序列数在 1..MAX_BATCH 之间变化不改变单次 iteration 耗时。因此 decode 吞吐
  ≈ 批大小 / T_DECODE_MS，随批大小线性增长——这正是"批"对 decode 值钱的原因。
- prefill 是计算瓶颈：prefill 时长 = prompt_tokens / PREFILL_RATE。
  continuous batching 里 prefill 与 decode 并行（vLLM 式双资源模型），不拉长 decode iteration；
  静态批里 prefill 是串行独立阶段，整个阶段 decode 空转。
- 显存/KV cache 充足，容量只由 MAX_BATCH 限定（显存边界见文章第五节）。

两种策略吃同一份请求 trace（固定随机种子），保证差异只来自调度策略。

指标：
- req/s 与 output tok/s：完成吞吐。
- GPU 空闲率：wall 时间内 GPU 既不 decode 也不 prefill（纯空转）的比例。
- decode 容量利用率：Σ(每步活跃数) / (MAX_BATCH × decode 步数)，刻画批内空档与尾部浪费。

运行：
    python3 experiments/llm-batching/sim.py
    python3 experiments/llm-batching/sim.py --arrivals "1,2,4,8,16,32" --max-batch 16
    python3 experiments/llm-batching/sim.py --plot curves.png   # matplotlib 可用时输出对比曲线
"""

import argparse
import random
from collections import deque

DEFAULT_T_DECODE_MS = 10      # 单次 decode iteration 耗时（毫秒）
DEFAULT_MAX_BATCH = 16        # 同时活跃的 decode 序列上限
DEFAULT_PREFILL_RATE = 8.0    # prefill 计算吞吐（tok/ms，300 token ≈ 37ms）
DEFAULT_PROMPT_MEAN = 300.0   # prompt 长度均值
DEFAULT_OUTPUT_MEAN = 200.0   # 输出长度均值
DEFAULT_SEED = 42
DEFAULT_N = 1200


def gen_trace(n, arrival_rate, rng):
    """生成一份请求 trace：泊松到达（每 1000ms arrival_rate 个）+ 截断高斯 prompt/output 长度。"""
    trace = []
    t = 0.0
    for _ in range(n):
        t += rng.expovariate(arrival_rate / 1000.0)
        prompt = max(50, min(1024, int(rng.gauss(DEFAULT_PROMPT_MEAN, DEFAULT_PROMPT_MEAN * 0.5))))
        output = max(10, min(600, int(rng.gauss(DEFAULT_OUTPUT_MEAN, DEFAULT_OUTPUT_MEAN * 0.6))))
        trace.append((t, prompt, output))
    trace.sort(key=lambda r: r[0])
    return trace


def run_static(trace, t_decode, max_batch, prefill_rate):
    """静态批：GPU 空闲且队列非空 → 取最多 max_batch 个，先串行 prefill 再整批 decode。

    批一旦进入 decode 即锁定：新请求只能在下一批加入；批内先完成的序列不腾位，
    空槽留到整批结束（尾部空档）。
    """
    n = len(trace)
    done = 0
    t = 0.0
    ai = 0
    pending = deque()
    idle_wall = 0.0
    total_work = 0
    total_iters = 0
    latencies = []

    while done < n:
        while ai < n and trace[ai][0] <= t:
            pending.append(trace[ai])
            ai += 1
        if not pending:
            if ai >= n:
                break
            idle_wall += trace[ai][0] - t
            t = trace[ai][0]
            continue

        batch = [pending.popleft() for _ in range(min(max_batch, len(pending)))]
        batch_start = t
        prefill_ms = sum(r[1] for r in batch) / prefill_rate
        t += prefill_ms
        max_out = max(r[2] for r in batch)
        for i in range(max_out):
            active = sum(1 for r in batch if r[2] > i)
            total_work += active
            total_iters += 1
            t += t_decode
        for r in batch:
            done += 1
            latencies.append((batch_start + prefill_ms + r[2] * t_decode) - r[0])
    return done, t, idle_wall, total_work, total_iters, latencies


def run_continuous(trace, t_decode, max_batch, prefill_rate):
    """continuous batching：iteration 粒度调度。

    - 新请求到达即开始 prefill（与 decode 并行），prefill 完成后排队等空槽；
    - 每步 decode 后，已完成的序列立即腾槽，就绪请求立刻补进空槽；
    - GPU 无活跃序列且无就绪请求时记为空转。
    """
    n = len(trace)
    done = 0
    t = 0.0
    ai = 0
    active = []        # [剩余 output token 数, 到达时刻]
    ready_q = deque()  # (ready_time, output, arrival)，prefill 已完成、在等空槽
    idle_wall = 0.0
    total_work = 0
    total_iters = 0
    latencies = []

    while done < n or active or ready_q:
        while ai < n and trace[ai][0] <= t:
            at, prompt, output = trace[ai]
            ai += 1
            ready_q.append((at + prompt / prefill_rate, output, at))
        waiting = deque()
        for rt, out, at in ready_q:
            if rt <= t and len(active) < max_batch:
                active.append([out, at])
            else:
                waiting.append((rt, out, at))
        ready_q = waiting

        if not active:
            nxt = None
            if ai < n:
                nxt = trace[ai][0]
            if ready_q:
                nxt = ready_q[0][0] if nxt is None else min(nxt, ready_q[0][0])
            if nxt is None:
                break
            idle_wall += nxt - t
            t = nxt
            continue

        total_work += len(active)
        total_iters += 1
        t += t_decode
        nxt_active = []
        for rem, at in active:
            if rem > 1:
                nxt_active.append([rem - 1, at])
            else:
                done += 1
                latencies.append(t - at)
        active = nxt_active
    return done, t, idle_wall, total_work, total_iters, latencies


def summarize(label, done, wall_ms, idle_wall, total_work, total_iters, latencies):
    if wall_ms <= 0 or done == 0:
        return f"{label:>9} | 完成={done:>4} | wall_s=0 | 无有效数据"
    wall_s = wall_ms / 1000.0
    idle_rate = idle_wall / wall_ms
    decode_util = total_work / (total_iters * DEFAULT_MAX_BATCH) if total_iters else 0.0
    mean_lat = sum(latencies) / len(latencies) / 1000.0
    return (
        f"{label:>9} | {done:>5} | {wall_s:>7.1f} | {done / wall_s:>8.2f} | "
        f"{total_work / wall_s:>9.1f} | {idle_rate * 100:>6.1f}% | "
        f"{decode_util * 100:>6.1f}% | {mean_lat:>8.1f}"
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--arrivals", default="1,2,4,8,16,32", help="到达率扫描列表（req/s）")
    ap.add_argument("--max-batch", type=int, default=DEFAULT_MAX_BATCH)
    ap.add_argument("--t-decode-ms", type=float, default=DEFAULT_T_DECODE_MS)
    ap.add_argument("--prefill-rate", type=float, default=DEFAULT_PREFILL_RATE)
    ap.add_argument("--n", type=int, default=DEFAULT_N)
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--plot", default="", help="输出对比曲线 PNG 路径（需 matplotlib，可选）")
    args = ap.parse_args()

    rates = [float(x) for x in args.arrivals.split(",") if x.strip()]
    header = (
        f"{'策略':>9} | {'完成':>5} | {'wall_s':>7} | {'req/s':>8} | "
        f"{'out tok/s':>9} | {'GPU空闲率':>8} | {'decode利用率':>11} | {'平均时延s':>9}"
    )
    print(header)
    print("-" * len(header))

    rows = []  # (rate, policy, req_s, idle_rate, decode_util) 供绘图
    for rate in rates:
        rng = random.Random(args.seed)
        trace = gen_trace(args.n, rate, rng)
        s = run_static(trace, args.t_decode_ms, args.max_batch, args.prefill_rate)
        c = run_continuous(trace, args.t_decode_ms, args.max_batch, args.prefill_rate)
        for label, res in (("静态批", s), ("continuous", c)):
            print(f"λ={rate:>3.0f}/s | " + summarize(label, *res))
        rows.append((rate, s[0], s[1], s[2], s[3], s[4]))
        rows.append((rate, c[0], c[1], c[2], c[3], c[4]))

    if args.plot:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            print(f"\n[提示] matplotlib 未安装，跳过绘图：{args.plot}")
            return
        fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
        # rows 交错：静态批在偶数位，continuous 在奇数位；每行 (rate, done, wall_ms, idle_wall, ...)
        for label, take in (("静态批", 0), ("continuous batching", 1)):
            sr = rows[take::2]
            xs = [r[0] for r in sr]
            axes[0].plot(xs, [r[1] / (r[2] / 1000.0) for r in sr], marker="o", label=label)
            axes[1].plot(xs, [r[3] / r[2] for r in sr], marker="o", label=label)
        axes[0].set_title("吞吐（req/s）")
        axes[0].set_xlabel("到达率 λ（req/s）")
        axes[1].set_title("GPU 空闲率")
        axes[1].set_xlabel("到达率 λ（req/s）")
        for ax in axes:
            ax.grid(True, alpha=0.3)
            ax.legend()
        fig.tight_layout()
        fig.savefig(args.plot, dpi=150)
        print(f"\n[绘图] 已保存：{args.plot}")


if __name__ == "__main__":
    main()
