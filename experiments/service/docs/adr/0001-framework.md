# 0001 框架：Hono + @hono/node-server

## 状态

Accepted for local teaching prototype，2026-08-16；last reviewed 2026-08-17。

这个决策只覆盖 `experiments/service/` 的本地订单原型。它不是生产框架认证，也不包含线上吞吐、冷启动或内存承诺。

## 背景

订单助手的 HTTP 层同时服务两类调用方：人类调试请求和 Agent 工具调用。对 Agent 更重要的不是框架的品牌，而是失败是否能被程序读取、修正并安全重试。当前服务需要把 schema 失败、业务冲突和内部异常区分成稳定的 API 错误合同：

```json
{
  "error": {
    "code": "INVALID_BODY",
    "message": "request body failed validation",
    "details": [
      { "path": ["qty"], "code": "too_big", "message": "..." }
    ]
  }
}
```

如果选择只看路由吞吐的基准，等于把 Agent 最需要的错误信息从决策问题里删掉。

## 决策

订单服务使用 Hono handler，Node 运行时由 `@hono/node-server` 提供适配；输入 schema 使用 Zod，校验失败在 handler 边界转换为项目自己的 `{ error: { code, message, details } }` 合同。

当前选择有三个可验证的理由：

1. 仓库已有 `@hono/zod-validator` 与 Hono handler 组合，错误可以在请求边界映射成带字段路径的 `details`。
2. `createApp(store, metrics)` 可以用 `app.request()` 注入内存替身测试，不要求每个单测先启动真实端口。
3. HTTP 适配层与订单、指标合同分离；如果未来运行时改变，先替换 adapter，再重新验证同一组 API 和错误测试。

## 选项比较

| 选项 | 当前能直接验证的价值 | 必须承担的代价 | 当前决策 |
| --- | --- | --- | --- |
| Hono + `@hono/node-server` | handler、Zod validator、`app.request()` 测试路径已经存在 | 需要维护 Node adapter；跨运行时能力不能替代部署验证 | 采用 |
| Fastify | 路由、schema 和序列化能力完整 | Fastify 的校验输出仍要映射成当前 API error contract；迁移后必须重跑全部错误/幂等测试 | 保留为候选 |
| 裸 `node:http` | 依赖面小，控制权直接 | 路由、body 限制、schema 校验、错误合同和观测都要自行维护 | 不采用 |

这张表不是性能排名。当前 checkout 没有保存三种实现的同语义 raw benchmark，因此不把吞吐、冷启动或 bundle 大小写入理由。若性能成为决策因子，必须另建一次只改变框架变量的实验，并保存环境、输入、预热、重复次数、原始输出和 commit。

## 后果

### 正面后果

- Agent 可以依据 `error.code` 和 `details[].path` 修正输入，而不是解析人类日志。
- handler 可以在不启动端口的情况下被集成测试覆盖，测试失败路径更快、更确定。
- 框架选择与存储实现解耦；当前的内存 store 可以替换为数据库 store，再复用 API 合同测试。

### 负面后果

- `@hono/node-server` 是额外的运行时适配依赖；本地通过不代表 Bun、Workers 或生产 Node 部署已经验证。
- 单进程 `BoundedInMemoryStore` 不能提供重启恢复、多实例竞争或 PostgreSQL 唯一约束语义。
- 为了保持错误稳定，业务代码需要维护错误码、消息和 details 的兼容性；这比直接把底层异常透传给调用方更费约束。

## 证据与推翻条件

当前证据只包括：

- `npm run typecheck`、3 个 Vitest 文件、18 个测试通过；
- `npm run build` 生成非空 `dist/app.js`；
- `src/app.ts` 的 400、404、409、500、幂等重放和并发 claim 测试通过。

以下事实仍不能从本 ADR 推出：

- Hono、Fastify、裸 `node:http` 的生产吞吐排序；
- Node 20/22/24 的真实 Actions run；
- TLS、代理、PostgreSQL、网络抖动和远程依赖下的 p99；
- Bun、Workers 或容器部署的兼容性。

满足下面任一条件，就应重新打开 ADR：

1. 新框架能在同一错误合同下显著降低维护成本，并有可审计的迁移测试；
2. 真实端口 benchmark 在与业务负载相同的输入、版本和环境下显示当前方案违反已批准的延迟或吞吐门槛；
3. 存储、部署或运行时适配要求使 Hono handler 无法保持现有 API 合同。
