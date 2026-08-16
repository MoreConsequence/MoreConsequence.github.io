# tree-shaking-comparison-costs：本机证据

## 命令

从仓库根目录执行：

```bash
cd experiments/ts-interface-schema
npm ci
node scripts/tree-shaking-boundary.mjs
```

The script builds the same `used` function and five unused exports twice with esbuild: once behind a CommonJS `module.exports` boundary and once as ESM named exports. It uses `bundle=true`, `minify=true`, `format=esm`, `platform=browser`, `target=es2022` and `treeShaking=true`.

## 结果

```text
entry	raw_bytes
cjs	964
esm	56
```

## 解释边界

- This is a synthetic module, not lodash. It demonstrates a bundler boundary, not a universal library-size multiplier.
- The result is raw minified JavaScript bytes; it is not gzip, brotli, parsed memory, or a production route bundle.
- The lockfile SHA-256 for this snapshot is recorded in `environment.txt`; changing the lockfile, target or entry requires a new evidence snapshot.
