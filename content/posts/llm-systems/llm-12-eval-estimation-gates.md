---
title: "eval 两件事：估计要准，门要严"
description: "pass@k 必须用无偏估计（朴素 c/n 把 0.51 算成 0.30），发布门必须关键一票否决加版本绑定加抖动预算（v1 放行、v2 三条注入拦截）。两组断言全过，同一主题：评测的可信度分两层。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-18"
tags: ["LLM", "eval", "统计", "CI/CD"]
draft: false
featured: false
series: "大模型后端架构与推理加速"
---

**TL;DR：** eval 的可信度分两层：估计层——每题 10 采样 k=2 时朴素均值 0.297（锁定 p，系统性低估），无偏组合子 0.506（锁定真值 0.51）；门禁层——关键失败一票否决（v2 的 80.8% 通过率照样拦）、数据集版本绑定基线、裁判抖动单独预算。两组断言全过（3+4）。

## 一、估计：k=2 时“至少对 1 次”不是“对的比例”

10 次对 3 次，任取 2 次至少对 1 次的概率是 `1 - C(7,2)/C(10,2) ≈ 0.53`。n-c<k 时走显式分支记 1（K4 已锁定）。汇报 pass@k 先问分母是 n 还是组合子（`experiments/pass-at-k/passk.py`，固定种子 2000 题）。

## 二、门禁：三条 if，不是看板

关键失败直接拦、数据集版本绑定基线、抖动单独预算，退出码即合同。v2 报告 `overall 0.808` 照样 `BLOCK`——这就是一票否决与看平均分的区别（`experiments/eval-deploy-gate/gate.py`）。门脚本自身也要 cwd 无关（`Path(__file__).parent`，实测踩过）。

## 三、证据卡与边界

原始输出：`evidence/pass-at-k/`、`evidence/eval-deploy-gate/`（2026-09-14-local）。不支持：真实模型与裁判、温度分布形状、生产 CI 负载。

## 参考资料

- Codex / HumanEval pass@k 定义，Chen et al. 2021
- 前篇：LLM-as-Judge（偏差与 Kappa），`/writing/llm-08-llm-as-a-judge-eval-engineering`
- 数据集污染对照：[eval 集泄漏膨胀](/writing/eval-set-leakage)（门再严，数据集漏了也白搭）
