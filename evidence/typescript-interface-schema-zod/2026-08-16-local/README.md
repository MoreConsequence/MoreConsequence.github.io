# typescript-interface-schema-zod：本机证据

## 命令

```bash
cd experiments/ts-interface-schema
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node main.ts
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node scripts/bundle-sizes.mjs
```

## 结果

- `main.ts` 的运行输出在 `raw/main.txt`，证明 schema 校验、错误路径和类型推导示例可以执行。
- `raw/bundle.tsv` 保存 esbuild 的 minified ESM/browser/ES2022 输出大小和 metafile input 数量。
- 体积数据是当前依赖锁和当前构建参数的一次结果，不是“Zod 一定慢/大”的普遍结论。
