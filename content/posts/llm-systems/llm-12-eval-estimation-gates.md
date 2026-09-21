---
title: "eval 两件事：估计要准，门要严"
description: "pass@k 必须用无偏估计（朴素 c/n 把 0.51 算成 0.30），发布门必须关键一票否决加版本绑定加抖动预算（v1 放行、v2 三条注入拦截）。两组断言全过，同一主题：评测的可信度分两层。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-19"
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

运维附带预警：Langfuse 把 `AUTH_SESSION_MAX_AGE` 默认从 30 天砍到 14 天，未显式配置的自托管直接生效（PR [#16593](https://github.com/langfuse/langfuse/pull/16593) 及 v3 backport [#16677](https://github.com/langfuse/langfuse/pull/16677)，2026-09-19 核对）。这是滚动失活窗口不是吊销，但 eval 平台登录态与 CI 长效 token 审计要跟改——想保留 30 天就显式配 `43200`。教训与模型路由同一条：第三方默认会变，显式声明才作数。

评测附带预警：人审门本身会松。arXiv 2609.06213（2026-09-05，11,429 条评审、400 名重复评审人、207 天）测得 AI 代码评审通过率从早期的 30.5% 爬到后期的 36.6%（p=8.6e-8），且语言变化滞后于通过率变化——评审人不是静止的标尺。含义：人工通过率不能当静态 ground truth；门禁基线要定期重标，裁判（模型或人）都要防“越看越松”。落地一条：基线重标纳入发布流水线（模型 ID 变即重跑本篇第二节的门），别靠人记。重标记录与门脚本同仓（cwd 无关），新模型先跑影子门再切生产门——灰度期间双门并行，影子 BLOCK 只告警不拦，连续影子与生产一致才切换。门禁本身也要门禁——没人看的门等于没有门。

## 三、证据卡与边界

原始输出：`evidence/pass-at-k/`、`evidence/eval-deploy-gate/`（2026-09-14-local）。不支持：真实模型与裁判、温度分布形状、生产 CI 负载。

## 参考资料

- Codex / HumanEval pass@k 定义，Chen et al. 2021
- 前篇：LLM-as-Judge（偏差与 Kappa），`/writing/llm-08-llm-as-a-judge-eval-engineering`
- 数据集污染对照：[eval 集泄漏膨胀](/writing/eval-set-leakage)（门再严，数据集漏了也白搭）
- Langfuse 会话有效期变更：PR [#16593](https://github.com/langfuse/langfuse/pull/16593)、v3 backport [#16677](https://github.com/langfuse/langfuse/pull/16677)（2026-09-19 核对）
- 评审人习惯化漂移：arXiv 2609.06213，<https://arxiv.org/abs/2609.06213>（2026-09-05，11,429 条评审）
