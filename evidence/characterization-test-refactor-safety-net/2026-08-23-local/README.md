# evidence/characterization-refactor-safety-net/2026-08-23-local

store 重构安全网实验：characterization 快照 → 真实重构 → 突变验证。

## 环境

- darwin/arm64，Node v24.19.0，vitest v4.1.10
- 工件：`experiments/service/src/store-characterization.test.ts`（新增）、
  `experiments/service/src/store.ts`（重构对象）

## 运行命令

```sh
cd experiments/service
npx vitest run --reporter=verbose   # 重构前 / 重构后各跑一次
# 突变演示：把 evict 循环的 > 手工改成 >= 后重跑，随后 git checkout 还原
```

## 原始输出

- `before-refactor-all-green.log`：重构前基线。5 个测试文件，
  **28 passed | 1 expected fail (29)**（expected fail 是幂等 PR 评审篇固定的红灯反例）。
- `after-refactor-all-green.log`：提取 `conflictWith` 与 `writeNew` 之后，
  同一快照 **28 passed | 1 expected fail (29)**，数字逐条一致。
- `mutation-evict-offbyone-red.log`：`>` → `>=` 突变后：
  - 旧 `store.test.ts` 全部保持绿（含 `toBeLessThanOrEqual(100)`）——对 off-by-one 免疫；
  - 新快照两条红：`expected 99 to be 100`、`expected undefined to be defined`。

## 快照期间记录到的真实行为（非期望行为）

1. `create()` 写入的无键订单被驱逐时不触碰 `byKey`：混合路径下 `size`(2) 可以大于 `keySize`(1)。
2. 首次保存未带指纹时，后续不同指纹**不判冲突**（缺一边就不比），权威结果保持首次订单。

## 边界

- 只覆盖进程内两个内存实现的可观测行为；`store-pg.ts`（Postgres 唯一约束）不在本快照范围。
- 突变演示是手工注入的单行变异，不是完整变异测试；只证明快照对该类回归有拉力。
