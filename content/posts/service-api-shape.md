---
title: "API 形状是合同：错误、重试与冲突必须一起定义"
description: "订单服务用 Zod 固定成功/失败形状，并用 PostgreSQL 唯一约束验证同 key 并发只会产生一个权威订单；同 key 不同 body 返回 409。本机已验证数据库层原子 claim，仍未覆盖多实例与真实部署。"
publishedAt: "2026-08-16"
updatedAt: "2026-08-19"
tags: ["API 设计", "契约", "zod", "Hono"]
draft: false
featured: false
series: "把原理变成服务"
---

**TL;DR：** API 契约不只规定 200 的 JSON 长什么样，还要规定校验失败、重复请求和同 key 不同 payload 怎么结束。订单服务把错误统一成 `{error:{code,message,details?}}`，并让 `saveByKey` 返回权威结果：100 个并发同 key 请求得到 1 个 201、99 个相同订单的 200；同 key 携带不同 body 得到 409。进程内原型用同步临界段修复 check-then-act，PostgreSQL 实现用唯一约束做原子 claim——两版本机都通过了并发、冲突与重放实验，仍未验证多实例与真实部署。

## 一、先定失败形状，再定成功形状

外部输入失败时，调用方需要知道三件事：机器应该分支到哪里，人应该读什么，Agent 应该修正哪个字段。服务统一返回。下面是 schema 关键节选，完整文件还需要导入 Zod 并接入 validator：

```ts
const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({
      path: z.array(z.string()),
      code: z.string(),
      message: z.string(),
    })).optional(),
  }),
});
```

`code` 是稳定的机器合同，`message` 是诊断文本，`details` 是结构化校验问题。Zod validator 的失败路径会直接返回响应，不会抛给 `app.onError`；因此当前代码使用第三个参数 hook，把 `error.issues` 映射到自己的错误合同。这个判断来自当前依赖源码，不是把异常处理当成万能出口。

## 二、成功与失败的输出要能从当前工件重跑

进入 `experiments/service/` 后用 Node 24 运行服务，再通过请求得到以下形状。订单号是随机 UUID 前缀，所以示例只约束字段，不把某一次 ID 当成固定输出。

```json
// GET /orders/ghost -> 404
{"error":{"code":"ORDER_NOT_FOUND","message":"order ghost not found"}}
```

```json
// POST 非法 body -> 400
{"error":{"code":"INVALID_BODY","message":"request body failed validation","details":[{"path":["sku"],"code":"too_small","message":"..."}]}}
```

```json
// POST 合法 body -> 201
{"orderId":"A-<uuid>","sku":"sku-9","customerId":7,"qty":3,"status":"CREATED","createdAt":"<RFC3339>"}
```

错误详情中的 message 受 Zod 版本影响，文章不把完整英文句子当稳定合同；`path`、`code` 和自定义外层 `error.code` 才是调用方应依赖的字段。

## 三、幂等不是“先查一下 Map”

原来的流程是：

```text
findByKey
  -> 不存在
  -> 构造 order
  -> saveByKey
  -> 返回自己构造的 order
```

两个并发请求都可能在 `findByKey` 处看到不存在，即使 `saveByKey` 后面拒绝覆盖，第二个 handler 仍会把自己构造的订单返回成 201。这是审计中复现的两个不同 orderId、两个 201 的根因。

当前原型把检查、写入和返回结果收进 `saveByKey`。下面是关键控制流节选，不是脱离 `OrderStore` 类型和完整文件即可复制运行的独立程序：

```ts
async saveByKey(key, order, fingerprint) {
  // 方法体内没有 await，单个 JS 事件循环不会在这里插入另一个 handler。
  const existing = this.byKey.get(key);
  if (existing) {
    return {
      order: existing.order,
      created: false,
      conflict: fingerprint !== undefined
        && existing.requestFingerprint !== undefined
        && existing.requestFingerprint !== fingerprint,
    };
  }
  this.byKey.set(key, { order, requestFingerprint: fingerprint });
  this.orders.set(order.orderId, order);
  return { order, created: true, conflict: false };
}
```

这条边界可以画成一条更严格的响应路径：

```mermaid
flowchart LR
  input["请求 body + idempotency key"] --> schema["Zod：解析与指纹输入"]
  schema -->|"非法 body"| bad["400 INVALID_BODY"]
  schema --> claim["单进程同步 claim"]
  claim -->|"首次成功"| created["持久化候选 + 201"]
  claim -->|"同 key 同指纹"| replay["权威结果 + 200"]
  claim -->|"同 key 不同指纹"| conflict["409 IDEMPOTENCY_CONFLICT"]
  created -."本机已验证：Map 同步临界段 + PG 唯一约束".-> boundary["未验证：多实例／真实部署"]
```

路由只把 `created: true` 映射成 201；重放是 200；指纹不同是 409。进程内版本的“原子”只在单个事件循环内成立；下面第四节用 PostgreSQL 唯一约束把同一个合同搬到数据库层。

## 四、反例先写进测试：100 个并发请求会怎样

`experiments/service/src/app.test.ts` 固定了三个比顺序重试更有价值的场景：

| 输入 | 创建副作用 | 响应 |
| --- | ---: | --- |
| 同 key、同 body，顺序两次 | 1 | 201，然后 200，订单号相同 |
| 同 key、同 body，并发 100 次 | 1 | 1 个 201，99 个 200，订单号全部相同 |
| 同 key、不同 body | 1 | 后续请求 409，不静默复用 |

这组测试证明了本地实现没有把“自己的临时 order”误当权威结果。测试只断言了协议形状，没有证明并发同 key 落在数据库层时也只产生一行——这一步用 PostgreSQL 唯一约束补齐：

```sql
INSERT INTO idem.orders
  (id, idempotency_key, fingerprint, sku, customer_id, qty, status, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id
```

`idempotency_key` 的唯一约束让数据库裁决“谁先到”：并发 INSERT 同 key 时恰好一个事务成功，其余全部进入冲突分支，再回读已提交的权威行。`experiments/service/src/store-pg.ts` 是这个实现的完整文件，`scripts/pg-idempotency.ts` 是本机三幕实验，在 Docker 里的 PostgreSQL 16.15（`blog-pg`）上实际输出：

| 输入 | created | conflict | 表内行数 |
| --- | ---: | ---: | ---: |
| 100 个并发同 key、同指纹 | 1 | 0 | 1 |
| 同 key、同指纹重放（重建连接后） | 0 | 0 | 1 |
| 同 key、不同指纹 | 0 | 1 | 1 |

同一份权威 order 在三幕里 id 始终不变，说明并发竞争时恰好一个请求创建，其余全部命中重放列。原始输出见 `evidence/service-postgres-idempotency/2026-08-19-local/run.out`，脚本与 store 实现同目录留存。

本机证据覆盖了以下原本缺失的语义，但没有覆盖以下生产语义：

- 已在本机验证：进程重启/重建连接后幂等记录仍然存在，重放仍返回同一权威订单；
- 已在本机验证：两个请求同时 claim 同一 key 时只有一行 INSERT 成功；
- 仍待验证：多实例同时运行（本机只测了单进程内的 100 并发）；
- 仍待验证：真实端口流量、稳定部署、真实过期策略与 TTL 回收；
- 仍待验证：业务副作用（发邮件、记账）与订单写入是否由同一个数据库事务裁决——本机实验只保证订单行的插入是原子的。

生产实现仍然需要唯一约束、请求指纹、状态字段、最终响应和过期策略。把内存 Map 直接搬到多实例服务，只是把竞态从测试里搬到网络上；把这份 PostgreSQL 实现直接部署，也还缺多实例与部署层验证。

## 五、结论：合同必须覆盖冲突，而不是只覆盖 happy path

这篇的增量不是再列一张字段表，而是把 API 的终态补全：

1. 校验错误必须有稳定外层形状和结构化 details。
2. 幂等响应必须返回权威结果，不能返回一个没有被保存的临时订单。
3. 同 key 不同 payload 必须显式冲突，不能把客户端 bug 伪装成重放。
4. 数据库层原子 claim 已用 PostgreSQL 唯一约束在本机验证；下一步是补多实例竞争与部署层证据，而不是再给内存原型增加“生产级”形容词。

## 参考资料

- [Hono zod-validator 文档](https://github.com/honojs/middleware/tree/main/packages/zod-validator)
- [Zod API 文档](https://zod.dev/api)
