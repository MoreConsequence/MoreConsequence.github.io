# TypeScript 工具链证据

这份快照读取当前博客仓库的 `package.json`、`package-lock.json` 和 `node_modules`，并记录 Node/npm/TypeScript/esbuild/zod 版本与依赖布局。它不模拟一个历史的 zod 3.x fixture，也不把当前 `node_modules` 条目数当成 pnpm 的普遍性能结论。

## 命令

```bash
node experiments/ts-toolchain-boundary/inspect.mjs
```

文章中的工具职责另外由当前配置和官方文档支持：`tsc --noEmit` 负责类型检查，esbuild 负责转译/打包但不做 TypeScript 类型检查；`npm ci` 与 lockfile 的安装合同需要按 npm 官方文档理解。

## 边界

- `node_modules_top_level_entries` 受安装器、依赖版本、平台和当前工作区影响，只是本次 npm 布局快照。
- 没有在本次快照中执行 pnpm 安装，因此不把 pnpm 的目录计数或速度写成已测事实。
- 没有把 `tsc` 与 esbuild 的 wall-clock 作为性能排名；若要比较，必须固定入口、配置、冷/热缓存、重复次数和产物检查。
