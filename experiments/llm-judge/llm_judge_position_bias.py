#!/usr/bin/env python3
"""量化 LLM-as-judge 的位置偏差，并对照人工标注计算一致率。

两种 judge 模式：
  --judge stub  一个确定性占位裁判，模拟「位置偏好 + 冗长偏好」，
                只用来验证检测管线本身能跑通，不代表任何真实模型。
  --judge api   调任意 OpenAI 兼容的 /chat/completions 端点做真实裁判
                （本地 vLLM / Ollama / 任意云 API 均可），通过环境变量：
                OPENAI_BASE_URL、OPENAI_API_KEY、JUDGE_MODEL。

对每个样本按 [A, B] 与 [B, A] 两个顺序各评一次：
  - 交换顺序后内容层面的赢家不一致 => 该样本被位置偏差影响（flip）；
  - 位置偏差率 = flip 样本数 / 双方都给出明确赢家的样本数；
  - 一致率 = judge 判定与人工标注（A/B/tie）一致的样本占比；
  - 同时给出 Cohen's kappa，修正“随机一致”之后的真实一致性。

纯标准库实现，无需任何第三方依赖。
"""

import argparse
import json
import math
import os
import re
import sys
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

JUDGE_SYSTEM = (
    "你是严格、中立的评估裁判。你只根据候选回答与问题的相关性、准确性和完整性打分。"
    "你必须输出一个 JSON 对象，形如 {\"winner\": \"A\"}、{\"winner\": \"B\"} 或 {\"winner\": \"tie\"}。"
    "winner 指候选标签（A 或 B），两者质量相近无法区分时输出 tie。"
    "不要输出任何其它内容。"
)


def load_samples():
    with open(BASE_DIR / "data" / "samples.json", encoding="utf-8") as f:
        return json.load(f)


# ---------- 占位裁判：位置偏好 + 冗长偏好（用于验证管线，非真实模型） ----------

def stub_judge(question, cand1, cand2):
    """确定性占位裁判。

    规则写得很直白：若第二个候选比第一个长超过 25%，判定第二个（冗长偏好）；
    否则判定第一个（位置偏好）。刻意模拟 MT-Bench 论文报告的两类偏差。
    """
    _ = question  # 占位裁判不看问题，只演示偏差；真实裁判必须看问题
    if len(cand2) > 1.25 * len(cand1):
        return "B"
    return "A"


# ---------- API 裁判：OpenAI 兼容端点 ----------

def api_judge(question, cand1, cand2):
    base_url = os.environ.get("OPENAI_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
    api_key = os.environ.get("OPENAI_API_KEY", "EMPTY")
    model = os.environ.get("JUDGE_MODEL", "local-model")
    if not (os.environ.get("OPENAI_BASE_URL") or os.environ.get("OPENAI_API_KEY")):
        sys.exit(
            "api 模式需要环境变量：OPENAI_BASE_URL、OPENAI_API_KEY、JUDGE_MODEL。\n"
            "本地可先用 vLLM / Ollama 起一个 OpenAI 兼容服务，再跑本脚本。"
        )

    user = (
        f"【问题】\n{question}\n\n"
        f"【候选 A】\n{cand1}\n\n"
        f"【候选 B】\n{cand2}\n\n"
        "只输出 {\"winner\": \"A\"}、{\"winner\": \"B\"} 或 {\"winner\": \"tie\"}。"
    )
    body = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": JUDGE_SYSTEM},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        base_url + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    text = payload["choices"][0]["message"]["content"]
    m = re.search(r'"winner"\s*:\s*"(A|B|tie)"', text)
    if not m:
        # 格式崩塌：裁判没按约定输出 JSON，本样本标记为不可用
        return "format_error"
    return m.group(1)


# ---------- 指标 ----------

def content_winner(order_label_winner, order):
    """把「裁判在某种展示顺序下给出的标签」还原成「内容层面的赢家」。

    order 为展示顺序，如 ("A","B") 表示第一个位置是 A、第二个位置是 B。
    裁判返回的标签是展示时的标签；内容赢家看的是这个标签背后的内容。
    """
    if order_label_winner in ("tie", "format_error"):
        return order_label_winner
    return {"A": order[0], "B": order[1]}[order_label_winner]


def cohen_kappa(a, b):
    """Cohen's kappa：修正随机一致后的真实一致率。a、b 为等长标签序列。"""
    n = len(a)
    if n == 0:
        return float("nan")
    labels = sorted(set(a) | set(b))
    agree = sum(1 for x, y in zip(a, b) if x == y)
    po = agree / n
    # 每类的边际概率
    p_a = {k: a.count(k) / n for k in labels}
    p_b = {k: b.count(k) / n for k in labels}
    pe = sum(p_a[k] * p_b.get(k, 0.0) for k in labels)
    if pe >= 1.0:
        return float("nan")
    return (po - pe) / (1.0 - pe)


def run(judge_fn, samples):
    rows = []
    flips, decided = 0, 0
    agree, total = 0, 0
    human_seq, judge_seq = [], []

    for s in samples:
        q = s["question"]
        a, b = s["answer_a"], s["answer_b"]
        human = s["human_label"]

        # 顺序 1：[A, B]
        v1 = judge_fn(q, a, b)
        w1 = content_winner(v1, ("A", "B"))
        # 顺序 2：[B, A]——A 被放到第二个位置
        v2 = judge_fn(q, b, a)
        w2 = content_winner(v2, ("B", "A"))

        decided_here = (w1 in ("A", "B") and w2 in ("A", "B"))
        flip_here = decided_here and (w1 != w2)
        if decided_here:
            decided += 1
            flips += int(flip_here)

        # 一致率：用顺序 1 的内容赢家与人工标注对照
        judge_label = w1
        if judge_label in ("A", "B", "tie"):
            total += 1
            agree += int(judge_label == human)
            human_seq.append(human)
            judge_seq.append(judge_label)

        rows.append({
            "id": s["id"],
            "human": human,
            "w1": w1,
            "w2": w2,
            "flip": "是" if flip_here else ("—" if not decided_here else "否"),
        })

    flip_rate = (flips / decided * 100) if decided else float("nan")
    agree_rate = (agree / total * 100) if total else float("nan")
    kappa = cohen_kappa(human_seq, judge_seq) if total else float("nan")

    return {
        "rows": rows,
        "samples": len(samples),
        "decided": decided,
        "flips": flips,
        "flip_rate_pct": flip_rate,
        "agree": agree,
        "total_compared": total,
        "agree_rate_pct": agree_rate,
        "kappa": kappa,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--judge", choices=["stub", "api"], default="stub",
                    help="stub=占位裁判（默认）；api=OpenAI 兼容端点真实裁判")
    args = ap.parse_args()

    samples = load_samples()
    judge_fn = stub_judge if args.judge == "stub" else api_judge
    mode = "占位裁判（stub，模拟位置/冗长偏好）" if args.judge == "stub" else "API 真实裁判"

    r = run(judge_fn, samples)

    print(f"裁判模式: {mode}")
    print(f"样本数: {r['samples']}")
    print()
    header = f"{'样本':<6}{'人工':<6}{'顺序1赢家':<10}{'顺序2赢家':<10}{'被位置翻盘'}"
    print(header)
    print("-" * len(header))
    for row in r["rows"]:
        print(f"{row['id']:<6}{row['human']:<6}{row['w1']:<10}{row['w2']:<10}{row['flip']}")
    print()
    print(f"位置偏差: {r['flips']}/{r['decided']} 个样本交换顺序后翻盘，位置偏差率 = {r['flip_rate_pct']:.1f}%")
    print(f"与人工标注一致率: {r['agree']}/{r['total_compared']} = {r['agree_rate_pct']:.1f}%")
    print(f"Cohen's kappa: {r['kappa']:.3f}")

    if args.judge == "stub":
        print()
        print("说明: 以上是占位裁判的输出，用于验证检测管线可运行。")
        print("      真实位置偏差请用 --judge api 配本地 vLLM/Ollama 或云 API 后复跑。")


if __name__ == "__main__":
    main()
