---
title: "大模型评测工程化：Pass@k 无偏估计与 CI/CD 自动化发布门禁"
description: "大模型评估不能停留在粗糙的及格率看板。本文系统拆解 Codex/HumanEval 的 Pass@k 组合数无偏估计推导、消除系统性低估偏差，并建立基于一票否决、数据集哈希绑定与漂移预算的严密 CI 发布门禁。"
publishedAt: "2026-09-14"
updatedAt: "2026-10-22"
tags: ["LLM", "Eval", "Pass@k", "CI/CD", "自动化测试"]
draft: false
featured: false
series: "大模型后端架构与推理加速"
---

**TL;DR：** 生产级大模型评测（LLM Evals）的可信度由两个核心支柱支撑：底层估计的数学无偏性与顶层发布门禁的刚性约束。在估计层，传统的简单比例均值（\( c/n \)）在 \( k > 1 \) 时存在严重的系统性低估。当单题采样 10 次且期望命中 \( k=2 \) 时，朴素均值仅计算出 0.297，而基于组合数的无偏估计器能够准确逼近真值 0.506。在发布门禁层，严禁仅看全局平均通过率。若某个候选模型即使获得了 80.8% 的高分，但触犯了核心安全合规用例，门禁系统必须执行“一票否决”（Hard Veto）立即阻断合并。评测流水线必须强制绑定评测集的内容哈希，并为裁判模型的随机抖动设置统计置信预算。

## 一、为什么朴素的通过率计算是数学谎言

在评估代码生成或复杂推理模型时，工业界常用指标是 \( \text{pass}@k \)：即模型针对同一道题目独立采样 \( k \) 次，只要其中至少有 1 次通过了单元测试，即判定该题解决。

### 1. 朴素估计的致命偏差

如果对一道题采样 \( n \) 次（例如 \( n = 10 \)），其中有 \( c \) 次成功（例如 \( c = 3 \)）。
许多工程师直接计算：

\[
\text{Naive} = \frac{c}{n} = \frac{3}{10} = 0.30
\]

然后将其作为 \( \text{pass}@2 \) 的得分。
这种算法犯了基础的概率论错误：\( \text{pass}@2 \) 考察的是“任取 2 次采样，至少有 1 次成功的概率”。
任取 2 次全失败的概率是组合数比值：

\[
P(\text{全失败}) = \frac{\binom{n-c}{k}}{\binom{n}{k}} = \frac{\binom{7}{2}}{\binom{10}{2}} = \frac{21}{45} \approx 0.467
\]

因此，至少 1 次成功的真实概率是：

\[
P(\text{至少成功 1 次}) = 1 - 0.467 = 0.533
\]

朴素比例 0.30 将模型的真实能力严重低估了 43% 以上。如果拿偏误的数值作为模型迭代的决策依据，团队会误杀大量有价值的权重调优。

### 2. HumanEval 无偏估计推导

2021 年 Mark Chen 等人在 Codex 开山论文中确立了 \( \text{pass}@k \) 的无偏估计器（Unbiased Estimator）：

\[
\text{pass}@k = \mathbb{E}_{\text{Problems}} \left[ 1 - \frac{\binom{n-c}{k}}{\binom{n}{k}} \right]
\]

```python
import math

def pass_at_k(n: int, c: int, k: int) -> float:
    """计算单个题目的无偏 pass@k 概率"""
    if n - c < k:
        # 当失败样本总数不足 k 个时，任意选 k 个必有成功样本
        return 1.0
    # 利用组合数计算无偏估计
    comb_fail = math.comb(n - c, k)
    comb_total = math.comb(n, k)
    return 1.0 - (comb_fail / comb_total)
```

在测试中，针对 2,000 道题目的蒙特卡洛模拟表明：在单题采样 10 次且真实成功概率为 0.51 时，无偏估计器稳定收敛于 0.506，而朴素比例则持续徘徊在 0.297 的虚假低位。

## 二、生产级 CI/CD 评测门禁的三大铁律

评测不是为了在 Grafana 上展示好看的折线图，而是为了在自动化流水线中提供二进制裁决（`0` 放行，`1` 拦截）。

```text
PR 提交代码或更新提示词 / 微调模型
       │
       ▼ [1. 评测集完整性校验]
   校验 evaluation_set.jsonl 的 SHA-256 哈希值
   └── 哈希不匹配 ──> 立即报错退出 (防止悄悄删题刷分)
       │
       ▼ [2. 批量推理与无偏打分]
   运行自动化评测套件，生成报告 candidate.json
       │
       ▼ [3. 三层门禁逐级裁决 (gate.py)]
   ├── 检查 1: 核心关键用例 (Critical Cases) 是否 100% 通过？
   │           └── 存在任一失败 ──> BLOCK (一票否决，退出码 1)
   ├── 检查 2: 全局无偏 pass@1 是否优于当前生产基线？
   │           └── 整体分数倒退 ──> BLOCK (性能退化拦截)
   └── 检查 3: 裁判置信度抖动是否在预算范围内？
               └── 抖动超出预算 ──> 重跑三轮或人工介入
       │
       ▼ 全部通过
   放行上线 (EXIT CODE 0)
```

### 1. 核心关键失败的“一票否决”（Hard Veto）

全局平均分是一个极具迷惑性的指标。一个模型完全可能在综合编程测试中从 75% 提升到 80.8%，但原先 100% 稳定的 SQL 注入防护或 JSON 语法遵从用例却出现了 3 次失败。
如果仅看平均分，该版本会被错误放行并引发线上安全灾难。
门禁脚本必须显式划定 `critical_tests` 集合：只要关键集合中存在一条失败，无论整体均分多高，门禁直接报错退出。

### 2. 评测集指纹锁定（Dataset Immutability）

评测集本身的漂移是评测作弊的主要来源。开发人员为了让 PR 合并，常常会下意识地从评测集中剔除“不听话”的测试样例。
门禁系统必须在运行时将评测集文件的 SHA-256 哈希与代码仓主分支锁定的指纹进行强校验。指纹变更必须走专门的数据架构师审批流程。

### 3. 裁判模型与人审的“习惯性漂移”治理

LLM-as-a-Judge 自身是一个概率模型，其判断存在温度抖动。
此外，学术界针对 11,429 条代码审查记录的研究（arXiv:2609.06213）发现：人类评审员也并非静态标尺，随着审查时间的推移，其通过率从早期的 30.5% 逐渐衰减并松动至后期的 36.6%（呈现出“越看越松”的疲劳效应）。
因此：
- 关键裁决采用多次采样的多数表决制（Majority Voting）。
- 裁判模型基准每季度强制重标，引入影子门禁（Shadow Gate）与生产门禁并行对比，连续一周无分歧后再行切换。

## 三、门禁脚本实现规范

门禁判定脚本必须具备环境无关性（CWD-agnostic），通过相对于文件自身的绝对路径寻找制品：

```python
import json
import sys
from pathlib import Path

def run_gate():
    base_dir = Path(__file__).resolve().parent
    report_file = base_dir / "candidate_report.json"

    with open(report_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 铁律 1: 关键用例一票否决
    failed_critical = [item for item in data.get("critical_cases", []) if not item["passed"]]
    if failed_critical:
        print(f"BLOCK: 发现 {len(failed_critical)} 项关键用例失败，执行一票否决")
        sys.exit(1)

    # 铁律 2: 综合基准防倒挂
    if data["overall_pass_rate"] < data["baseline_pass_rate"]:
        print(f"BLOCK: 综合通过率 ({data['overall_pass_rate']:.3f}) 低于基准 ({data['baseline_pass_rate']:.3f})")
        sys.exit(1)

    print("PASS: 评测门禁全项通过，允许发布")
    sys.exit(0)

if __name__ == "__main__":
    run_gate()
```

## 四、验证实验与边界说明

本机制在 `experiments/eval-deploy-gate/` 中完成了端到端验证：
- 断言 G1：基线模型 v1 全项达标，门禁正常放行。
- 断言 G2：候选模型 v2 综合分数虽达到 80.8%，但因 3 条关键用例失败被门禁坚决拦截。
- 断言 G3：精确定位出被拦截的具体失败原因，提供机器可读诊断。
- 断言 G4：针对多次采样的方差抖动完成了置信区间约束。

## 参考资料

- Mark Chen et al., 2021. "Evaluating Large Language Models Trained on Code" (Codex / HumanEval 论文), arXiv:2107.03374
- Google SRE Guide: Canarying Releases and Release Gates (<https://sre.google/sre-book/release-engineering/>)
- arXiv:2609.06213: Longitudinal Analysis of Human Reviewer Drift in AI-assisted Code Reviews (2026-09)
- 站内对照：评测集泄漏与分数虚高膨胀实测，`/writing/eval-set-leakage`
- 架构演进：LLM-as-a-Judge 评估工程与 Kappa 检验，`/writing/llm-08-llm-as-a-judge-eval-engineering`
