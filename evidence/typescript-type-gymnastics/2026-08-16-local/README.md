# typescript-type-gymnastics：本机证据

## 命令

```bash
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node node_modules/typescript/bin/tsc -p experiments/ts-type-gymnastics/tsconfig.json --noEmit
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node experiments/ts-type-gymnastics/registry2.ts
/Users/lianghaoyu/.nvm/versions/node/v24.19.0/bin/node experiments/ts-type-gymnastics/literal.ts
```

## 结果与口径

- `tsc` 退出码为 0；`@ts-expect-error` 消费了故意错误的参数调用。
- `raw/registry.txt` 与 `raw/literal.txt` 保留运行时输出。
- 这证明当前 TypeScript 版本下静态合同可以编译，并不证明外部 JSON 已被验证；运行时仍需要 schema/解析器。
