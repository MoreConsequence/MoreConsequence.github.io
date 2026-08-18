# TypeScript LLM tool loop：固定 seed 证据

## 命令

```bash
node node_modules/typescript/bin/tsc --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck experiments/ts-agent/main.ts
node experiments/ts-agent/main.js
```

`experiments/ts-agent/main.ts` 使用固定 LCG seed `20260817`，失败阈值为 0.3，工具延迟模型为 50–129ms，timeout 为 100ms。它不连接真实 LLM、数据库或网络服务；固定 seed 只保证这个模拟管线的输出可重放。

## 结论边界

输出可以验证 `unknown` 守卫、可辨识联合、`Promise.all`/`Promise.race` 的类型形状和 timeout/exploded/ok 三种结果如何回到主循环。它不能证明真实模型失败率、真实工具延迟、AbortSignal 的取消传播或线上幂等；写工具仍需要真实 I/O、取消和幂等测试。
