---
title: "重构不改行为，但你怎么证明？给 store 拍一套行为快照"
description: "对订单服务的 store 做一次真实重构：先写 characterization 快照钉住 29 条行为（含两个怪癖），重构后数字逐条一致，再用一个 off-by-one 突变验证安全网真的有拉力。"
publishedAt: "2026-08-23"
tags: ["工程实践", "测试", "重构", "Node.js"]
draft: true
featured: false
series: "把原理变成服务"
---

**TL;DR：** 重构的承诺是"行为不变"，但大多数套件只能证明"没变坏到我看得见"。本文对 `experiments/service/src/store.ts` 完成一次可复现的完整闭环：先新增 **9 条 characterization 快照**钉住精确行为（含两个此前无人写下的怪癖），再提取共享语义完成重构，连同既有套件共 **29 条用例**逐条全绿；最后注入一个 `>` → `>=` 的 off-by-one 突变——旧套件（`toBeLessThanOrEqual`）保持绿、对回归免疫，快照的精确等式当场红掉（`expected 99 to be 100`）。安全网的拉力来自精确，不来自数量。

## 一、重构的困境："没变"由谁作证

重构 store 之前有个无法回避的问题：改完之后，谁来证明"行为一个字节都没变"？靠肉眼 diff 不可靠——本次重构要动的恰恰是三处重复的条件表达式和一段三表写入逻辑，肉眼看"等价"的代码恰恰最容易在边界条件上失手。

已有的 `store.test.ts` 是按"应该怎样"写的单元测试，它有两个盲区：

1. 断言用的是**不等式**（`toBeLessThanOrEqual(100)`），任何"少删了几个"的回归都放行；
2. 只覆盖设计者想到的行为，没覆盖实现长出来的行为——怪癖不在它的视野里。

characterization test（行为快照）补的正是这两个盲区：不问"应该怎样"，只记录"现在怎样"，然后让这套记录替重构作证。

## 二、先拍照再动刀：快照的三条纪律

写 `store-characterization.test.ts` 时给自己立了三条纪律：

1. **断言写"是什么"，不写"应该是什么"**。发现预期与实现不符时，改断言去符合实现，并把差异记录下来交给人工判断——判断之前，现状就是合同。
2. **怪癖也是合同**。看起来可疑的行为只要是对外可观测的，就必须入册；将来要改它，必须作为显式行为变更过评审，不许在重构里顺手"修好"。
3. **能写等式就不写不等式**。容量断言写 `toBe(100)` 不写 `toBeLessThanOrEqual(100)`——第五节会展示这条纪律值多少钱。

## 三、拍照过程就是一次行为考古

快照写到第三条就抓到了第一个预判错误。我以为"`create()` 路径同样触发双表联动驱逐"，写成 `expect(store.size).toBe(store.keySize)`，结果红了：`expected 2 to be 1`。读实现才发现真实行为是——**无键订单被驱逐时不触碰幂等表**，混合路径下 `size`(2) 可以大于 `keySize`(1)。这个行为此前没有任何文档与测试提及。

第二个被钉住的怪癖在指纹冲突判定上：首次保存未带指纹时，后续带不同指纹的重放**不判冲突**（缺一边就不比），权威结果保持首次订单。这可能是有意取舍，也可能是疏忽——但重构前必须先回答"这是合同还是 bug"，而快照把问题从"没人知道有这回事"变成"显式决策点"。

考古产出（完整清单见 `evidence/characterization-test-refactor-safety-net/2026-08-23-local/README.md`）：

| 行为 | 快照断言 | 性质 |
| --- | --- | --- |
| 容量上限 | 150 笔进 cap=100，恰好剩 100 | 设计意图 |
| 驱逐顺序 | FIFO 按插入序，`get()` 不续命 | 设计意图 |
| 双表联动 | 订单与其幂等键同生共死（有键订单） | 设计意图 |
| 无键驱逐 | 不触碰 byKey，size 可大于 keySize | 快照新发现 |
| 指纹缺边 | 缺一边就不判冲突 | 快照新发现 |

## 四、动刀：提取共享语义与唯一写入口

重构本身很克制，只做两件事（`store.ts`）：

1. 两个实现的冲突判定原本各写一份三行布尔表达式，提取为模块级纯函数 `conflictWith(existingFp, incomingFp)`，并注释说明它是共享语义合同；
2. `BoundedInMemoryStore` 的"写三张表 + 排入驱逐队列 + 触发驱逐"五步提取为私有方法 `writeNew()`，注释标明它是新增写入路径的唯一入口。

公开 API、注释里的语义承诺、所有边界行为零改动。跑同一套快照：

```text
before-refactor-all-green.log: Tests  28 passed | 1 expected fail (29)
after-refactor-all-green.log:  Tests  28 passed | 1 expected fail (29)
```

数字逐条一致。"行为不变"不再是我的口头承诺，是 29 条断言的机器裁决。那个 `expected fail` 是[幂等 PR 评审篇](/writing/review-idempotent-pr-concurrency)固定在套件里的红灯反例，它同时也在验证快照套件自身没有被重构波及。

## 五、安全网的真实拉力：一个 off-by-one 突变

绿两次也可能是巧合——快照可能根本没长牙。验证方法是注入一个真实感很强的单行突变：把驱逐循环的 `while (this.orders.size > this.maxOrders)` 手工改成 `>=`。这类 off-by-one 正是重构中最容易引入的错误形态。结果：

| 套件 | 断言形态 | 突变后 |
| --- | --- | --- |
| 旧 `store.test.ts` | `toBeLessThanOrEqual(100)` | **保持绿**（99 ≤ 100 通过） |
| 新快照 | `toBe(100)` 精确等式 | 红：`expected 99 to be 100` |
| 新快照 | FIFO 位次 | 红：`expected undefined to be defined` |

旧套件的"不超上限"断言对"多删一个"完全免疫；快照的两条红把突变精准定位到容量等式与驱逐位次。这就是第二节第三条纪律的价值：**不等式给回归留活路，等式不给**。原始输出在 `mutation-evict-offbyone-red.log`，突变随后用 `git checkout` 还原，套件回到全绿。

需要诚实标注的边界：这是一次手工注入的单行变异，不是系统化的变异测试；它证明的是"该类回归会被咬住"，不是"所有回归都会被咬住"。

## 六、结论：快照是行为变更的报关单

这次闭环沉淀下来的流程只有四步，每一步都有工件可查：

1. 动刀前写行为快照，怪癖照单全收，等式优先；
2. 快照与实现不符时停下考古，把差异升级成显式决策；
3. 重构后同一快照重跑，数字逐条对比；
4. 抽一个高概率突变验牙口，然后立即还原。

快照的本质是把"当前行为"报关备案：从此任何人想改变行为——包括顺手修怪癖——都必须走报关流程，而不是夹带在重构里私运过关。下一步可执行的事：找到你项目里最常被改动、测试却最薄弱的那个类，给它拍一套两小时的快照，再动手重构。

## 参考资料

- 本篇实验与原始输出：`experiments/service/src/store-characterization.test.ts`、`evidence/characterization-test-refactor-safety-net/2026-08-23-local/`
- 站内相关：[评审幂等 PR：先让 100 个相同请求同时到达](/writing/review-idempotent-pr-concurrency)、[一次构造事故演练：两个 Map 为什么要一起验收](/writing/service-incident-drama)、[测试值多少钱：先把并发反例写进断言](/writing/service-testing-strategy)
- Michael Feathers,《Working Effectively with Legacy Code》第 5 章（characterization test 的原始定义）
