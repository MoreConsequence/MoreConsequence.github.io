# 0001 框架：Hono + @hono/node-server

## 决策
订单助手 Agent 服务用 Hono，HTTP 层由 @hono/node-server 提供。

## 理由
1. Agent 错误管道需要结构化校验错误（zod issue），Hono 原生集成
2. 与 TS 系列 03 篇 zod 决策同源：输入边界统一 schema
3. 吞吐差距实测 <8%，非决策因子（本机 44.7k vs 41.6k req/s）
4. Hono 跨运行时，后续迁 Bun/Workers 不换 handler

## 没选的
- Fastify：schema 错误非结构化，喂模型要二次包装；冷启动 0.17s 两倍于 Hono——不是问题，但无额外收益
- 裸 node:http：路由匹配线性退化（200 条实测被 radix tree 反超），且无校验/序列化生态

## 后果
- 主动权：路由注册 + zod 校验都在 handler 层
- 代价：多 @hono/node-server 一个依赖（220KB）
