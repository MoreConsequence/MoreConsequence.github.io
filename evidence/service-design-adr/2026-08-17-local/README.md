# Service ADR 本地证据

这份快照支撑 `service-design-adr` 和 `experiments/service/docs/adr/0001-framework.md` 当前能写出的最小结论：Hono + Zod 的本地 handler、错误转换、幂等测试和 TypeScript build 在当前 checkout 可运行。它不支撑 Hono、Fastify 或裸 `node:http` 的性能排名，也不支撑生产部署兼容性。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Node：v24.19.0
- TypeScript：5.9.3
- Vitest：4.1.10
- git HEAD：`da218a270d9f914a0fd372cb2836e7947b3db785`
- 命令：在 `experiments/service/` 执行 `npm run typecheck`、`npm test`、`npm run build`，并检查 `test -s dist/app.js`
- 原始输出：`raw/service-local-gate.txt`

## 结果

- typecheck：exit 0
- 3 个 test files、18 个 tests：通过
- build：exit 0
- `dist/app.js`：4377 bytes，非空

旧 ADR 中的吞吐、冷启动和依赖体积数字没有随当前 checkout 保存 raw，因此本快照不补回这些数字。若性能成为决策因子，必须建立独立的同语义 benchmark 快照。
