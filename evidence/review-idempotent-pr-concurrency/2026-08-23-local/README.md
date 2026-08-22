# evidence/concurrent-idempotent-pr-review/2026-08-23-local

幂等 PR 并发评审反例的原始运行记录。

## 环境

- 机器：Apple Silicon (darwin/arm64)
- Node v24.19.0，vitest v4.1.10
- 工件：`experiments/service/src/pr-review/before-store.ts`（被评审实现的重构基线，非历史快照）、`experiments/service/src/pr-review/concurrent.test.ts`

## 运行命令

```sh
cd experiments/service
# 红灯：以普通断言复现 PR 的真实失败
PR_REVIEW_RED=1 npx vitest run src/pr-review --reporter=verbose
# 绿灯：同一把尺子跑在合并后的实现上（it.fails 把红灯固定为可执行评审意见）
npx vitest run src/pr-review --reporter=verbose
```

## 原始输出

- `red-before-store.log`：`PR_REVIEW_RED=1` 运行。100 个同 key 并发请求全部 `created=true`，
  断言失败 `expected 100 to be 1`；同文件内对当前实现的对照测试通过。
- `green-current-store.log`：默认模式。`Tests 1 passed | 1 expected fail (2)`——
  被评审实现被 `it.fails` 固定为"必须红"，当前实现绿灯。

## 边界

- 本实验只证明**单进程 Node 内**的并发语义：竞争窗口由两次 `setTimeout(0)` 往返构成。
- 不证明多实例/数据库语义。生产权威裁决见 `experiments/service/src/store-pg.ts`
  （`idempotency_key UNIQUE` 约束），需要本地 PostgreSQL 实例，本次未运行。
