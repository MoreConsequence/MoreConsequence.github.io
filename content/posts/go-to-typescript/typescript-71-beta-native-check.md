---
title: "TS 7.1 nightly 自举实测：本仓 typecheck 快 5 倍，报错逐字一致"
description: "拿 7.1.0-dev 当日 nightly 给本博客仓库做 typecheck：0 errors 与 5.9.3 基线一致，耗时 1.7s→0.35s（冷）/0.9s→0.2s（热），故意写错的 TS2322 逐字相同，unstable/sync 可 import。Beta 结论与升级边界见正文。"
publishedAt: "2026-09-14"
tags: ["TypeScript", "工具链", "性能", "实测"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** TypeScript 7.1 Beta（2026-09-09，迭代计划 Beta→RC 10-20→Stable 11-10）正在补 7.0 缺的那块 API。本机拿当日 nightly（`7.1.0-dev.20260913.1`）给本仓库做 typecheck：与 5.9.3 基线同样 0 errors，耗时冷启动 1.69s→0.35s、热态 0.9s→0.2s（约 5x）；故意写错的 `TS2322` 两边逐字一致；`typescript/unstable/sync` 可 import（含 Checker/Emitter）。结论：CLI 侧现在就能用，API 侧等 Stable 前先在隔离目录试。

## 一、完整路径：一次升级验证走完什么

```text
npm i typescript@next（隔离实验目录，不碰仓内 5.9.3）
  → tsc --version 确认 7.1.0-dev
  → 同一 tsconfig 双跑：0 errors 对齐
  → 3 轮计时：冷/热各记
  → 坏文件对照：报错文本逐字比对
  → unstable/sync import：API 面存在性
```

## 二、合同：Beta 保证什么、不保证什么

| 维度 | 现状（2026-09-14） | 调用者仍负责 |
| --- | --- | --- |
| tsc CLI | 可用，与 6.0 同语义检查 | 按自家仓库重测（本篇只证明本仓） |
| 报错文本 | 本例逐字一致 | 全仓错误清单 diff（若升级） |
| 速度 | 本仓约 5x（冷 4.8x/热 4.5x） | 按自家规模重测，不是常数 |
| 程序化 API | `unstable/*` 可用，stable 待 7.1 Stable | eslint/Vue/Angular 链继续钉 6.0（官方建议 tsc6 并存） |
| 升级时机 | Beta 可试 | 生产等 11-10 Stable；API 消费者等 stable API |

## 三、实测数字

```text
5.9.3（仓内基线）: 1.69s / 0.86s / 0.91s，0 errors
7.1.0-dev.20260913.1: 0.35s / 0.21s / 0.20s，0 errors
```

第一轮是冷文件缓存，后两轮是热态——两边同条件，所以倍数（冷 4.8x / 热 4.5x）可比。注意 5.9.3 第一轮 1.69s 本身也有缓存效应，诚实读法是“约 5x”而不是精确常数。

## 四、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 问题 | 7.1 nightly 能否无缝接住本仓 typecheck，报错是否一致？ |
| 环境 | Darwin arm64，Node v24.19.0，TS 5.9.3 vs 7.1.0-dev.20260913.1 |
| 输入 | 本仓 tsconfig 全量 + 单文件坏用例 |
| 原始输出 | `evidence/ts71-beta-check/2026-09-14-local/run.out` |
| 支持结论 | 0 errors 对齐、约 5x、TS2322 逐字一致、unstable 可 import |
| 不支持结论 | 其他仓库规模、emit 一致性、eslint/Vue 链、Stable 前 API 稳定性 |

版本事实核对 2026-09-14：一手来源为 TS 7.1 iteration plan（GitHub #63703）与 7.0 公告（devblogs）；nightly 版本号即日期。

## 五、结论：CLI 先行，API 等 Stable

回到开头：7.1 Beta 把 7.0 的最大短板（无 API）补上了第一块。行动清单：隔离目录装 `next` 每周跑一次自家 typecheck（5 分钟）；生产 tsc 升级等 RC；`typescript-eslint` 等 API 消费者等 11-10 Stable。ts-loader 的迁移 PR 证明生态已经在动，你的验证可以跟上但不用抢跑。

## 参考资料

- TS 7.1 Iteration Plan（Beta 2026-09-09 / RC 10-20 / Stable 11-10），<https://github.com/microsoft/TypeScript/issues/63703>
- Announcing TypeScript 7.0（10x、API 缺席、tsc6 并存方案），<https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
- ts-loader TS 7.1 迁移 PR（`typescript/unstable/sync` 生态实证），<https://github.com/TypeStrong/ts-loader/pull/1704>
