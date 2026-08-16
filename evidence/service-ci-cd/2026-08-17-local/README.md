# Service CI 本地等价门禁

这份快照按根目录 `.github/workflows/service-ci.yml` 的 service 工作目录执行 typecheck、test、build 和非空 artifact 检查。它只证明当前机器上的本地 gate；它不是 GitHub Actions run，也不是部署、staging 或 production 证据。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Node：v24.19.0
- TypeScript：5.9.3
- Vitest：4.1.10
- git HEAD：`da218a270d9f914a0fd372cb2836e7947b3db785`
- 工作目录：`experiments/service`
- 命令序列：`npm run typecheck` → `npm test` → `npm run build` → `test -s dist/app.js`
- 原始输出：`raw/workflow-local.txt`

## 证据边界

本地结果证明 service package 在 Node 24 能安装后的当前依赖上通过 typecheck、18 个测试并生成 4377-byte `dist/app.js`。它不能证明 Node 20/22/24 的 Actions matrix 已通过，因为当前没有 run URL；也不能证明 artifact 被上传、部署、健康检查或回滚。workflow 的 `paths`、permissions、artifact 和缺失的 deploy 证据仍按文章中的五层发布门禁解释。
