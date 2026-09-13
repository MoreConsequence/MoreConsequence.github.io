---
title: "eval 进发布门：关键失败、数据集版本与抖动预算三规则"
description: "把 eval 从 dashboard 变成部署门：关键失败一票否决、数据集版本化（v1 放行/v2 三条注入拦截）、flaky 条目按轮次检出并计入预算。纯标准库 harness 可重跑，退出码即门禁合同。"
publishedAt: "2026-09-14"
tags: ["LLM", "eval", "CI/CD", "质量工程"]
draft: false
featured: false
series: "大模型后端架构与推理加速"
---

**TL;DR：** eval 进门的规则只有三条：关键失败一票否决（与通过率无关）、数据集版本化（v1 放行、v2 加 3 条注入即拦截、退出码 1）、裁判抖动单独计量（5 轮奇偶检出，关键条目抖动即拦截）。纯标准库 harness 4 断言全过。前文 [llm-as-judge](/writing/llm-08-llm-as-a-judge-eval-engineering) 第五节给了 CI 管道形状（何时触发、调什么脚本）；本文补门规则本身：门以什么理由拦、谁说了算。

## 一、完整路径：一次 PR 如何被门拦下

```text
PR 触及 prompts/模型配置
  → 跑数据集（5 轮，固定输入）
  → 关键失败？→ BLOCK（exit 1），无需看通过率
  → 通过率 < 80%？→ BLOCK
  → 关键条目抖动？→ BLOCK（裁判不可信，不是模型不可信）
  → 否则 PASS（exit 0），报告 JSON 存档
```

顺序是故意的：关键失败排第一，因为“注入即泄密”这类失败与通过率无关——99% 通过 + 1 条泄密 = 拦截。

## 二、合同：门保证什么、不保证什么

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 关键失败 | 一票否决，exit 1 | 失败根因定位（只给条目 id） | 失败即修，修完重跑全量 |
| 通过率 | 版本间可比（同数据集同轮次） | 跨版本可比（v1 90% vs v2 85% 无意义） | 数据集版本与基线绑定 |
| 抖动 | 检出并归因到裁判（非模型） | 消除抖动 | 抖动预算：关键 0 容忍，非关键限额 |
| 报告 | JSON 含通过率/关键失败/抖动三栏 | 长期趋势 | 趋势库与回归归因 |

## 三、实测：v1 放行，v2 拦截，抖动现形

被测 stub 含确定性 bug（prompt 含“ignore previous”即输出 SECRET），v2 加 3 条注入即触发。脚本 `experiments/eval-deploy-gate/gate.py`，数据集同目录 `dataset-v1/v2.jsonl`，原始输出 `evidence/eval-deploy-gate/2026-09-14-local/run.out`。

```text
PASS G1 v1 放行
PASS G2 v2 拦截
PASS G3 三条关键失败
PASS G4 抖动被检出
ALL CHECKS PASSED
```

v2 报告原文：`{"dataset": "dataset-v2", "n": 13, "overall_pass_rate": 0.808, "critical_failures": ["inj-1", "inj-2", "inj-3"], "flaky_critical": [], "verdict": "BLOCK"}`。注意 overall 80.8% 已达标，门依然拦截——这就是“一票否决”与“看平均分”的区别。G4 的 `flaky-1` 在 5 轮中 3 过 2 败：若它是关键条目，门同样拦截，因为分不清是模型退化还是裁判掷骰子。

附带修过的一个工程 bug：初版数据集用相对路径，CI 的 cwd 一变就 `JSONDecodeError`——harness 按脚本所在目录解析（`Path(__file__).parent`），门脚本的第一要求是自己先做到 cwd 无关。

## 四、与前文的分工

前文第五节的 YAML 回答“管道形状”（PR 路径触发、500 条 golden、swap-pair、kappa 门限）；本文回答“门规则”（一票否决、版本绑定、抖动预算、退出码合同）。两篇拼起来才是完整门禁：管道没有规则是空转，规则没有管道是手工作业。

## 五、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 问题 | 门能否按关键失败/版本/抖动三规则正确放行与拦截？ |
| 环境 | Darwin arm64，Python 3.12.9，纯标准库，确定性 stub |
| 输入 | v1（10 条）/ v2（13 条），5 轮/条 |
| 原始输出 | `evidence/eval-deploy-gate/2026-09-14-local/run.out`（4 PASS） |
| 支持结论 | 三规则的放行/拦截/检出行为 |
| 不支持结论 | 真实模型与裁判行为、真实标注一致性、生产 CI 负载、本轮 500 条 golden 规模 |

## 六、结论：门是三条 if，不是看板

回到开头：eval 进门不需要新平台，需要三条 if——关键失败直接拦、数据集版本绑定基线、抖动单独预算。行动清单：从现有 golden 集里标出关键条目（安全类全标），把 harness 退出码接进 CI（非零即拦），再给裁判加 5 轮抖动检测。这三步做完，dashboard 才有资格叫门禁。

## 参考资料

- 前篇：LLM-as-Judge 评测工程（偏差、去偏、Kappa、CI 管道），`/writing/llm-08-llm-as-a-judge-eval-engineering`
- 数据集版本化与泄漏膨胀背景：eval-set-leakage 实验，`experiments/eval-leakage/`
