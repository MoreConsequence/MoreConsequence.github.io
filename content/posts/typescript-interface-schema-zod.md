---
title: "接口边界三合一：schema 同时负责校验、类型与错误路径"
description: "用同一份 ToolCall schema 对照手写守卫、Zod 根入口和 zod/v4 named imports：当前 esbuild 0.28.0 本机输出分别为 619B、327428B 和 68099B raw，并补上同语义性能 benchmark（合法路径 zod/v4 约慢一个数量级，非法路径约慢 5 倍）。"
publishedAt: "2026-08-16"
updatedAt: "2026-08-19"
tags: ["TypeScript", "后端", "接口", "schema"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** schema 的价值不是“少写几行 `typeof`”，而是让运行时校验、静态类型和错误路径从同一个协议定义出来。当前实验用固定的 esbuild 0.28.0、browser/ESM、minify、ES2022 参数重算三种入口：手写守卫 619B raw，`zod` 根入口 327428B，`zod/v4` named imports 68099B。错误输出保留 `path`、`code` 和 message，并用同语义 benchmark 实测：合法路径 zod/v4 约慢一个数量级（≈0.1x）、非法路径约慢 5 倍；这个倍数只约束本机单核解析，不约束生产全链路。

## 一、三份真相为什么会漂移

手写 ToolCall 协议通常同时存在三份描述：TypeScript union、运行时字段检查、错误字符串。改了 `kind` 分支却漏改其中一份，编译器不一定能发现。

```ts
import { discriminatedUnion, literal, object, string } from "zod/v4";
import type * as z from "zod/v4";

const ToolCallSchema = discriminatedUnion("kind", [
  object({ id: string(), kind: literal("lookup_order"), orderId: string() }),
  object({ id: string(), kind: literal("get_stock"), sku: string() }),
  object({ id: string(), kind: literal("cancel_order"), orderId: string() }),
]);

type ToolCall = z.infer<typeof ToolCallSchema>;
```

这里的 `z` 是 type-only namespace，不会把一个运行时的 `z` 对象带进 bundle；值层使用 named imports，类型层使用 `z.infer`。这修复了原文“named imports 后直接写 `z.infer`，但作用域没有 `z`”的代码块错误。

## 二、体积实验：入口、目标和压缩口径必须固定

`experiments/ts-interface-schema/scripts/bundle-sizes.mjs` 用 esbuild API 对三个 entry point 统一设置：

```text
bundle=true, minify=true, format=esm, platform=browser,
target=es2022, treeShaking=true, write=false
```

Node 24.19.0、Zod 4.4.3、esbuild 0.28.0 本机一次输出：

| entry | raw | gzip | brotli | metafile inputs |
| --- | ---: | ---: | ---: | ---: |
| manual | 619 B | 258 B | 222 B | 1 |
| `zod` root | 327428 B | 64687 B | 54034 B | 80 |
| `zod/v4` named imports | 68099 B | 18931 B | 16840 B | 81 |

运行方法：

```bash
cd experiments/ts-interface-schema
npm ci
npm run typecheck
npm run bundle:sizes
```

这些数字是当前依赖锁、构建参数和本机一次运行的证据，不是所有 bundler、target 或压缩器的普遍结果。Node 后端直接从 `node_modules` 加载依赖时，不应把 browser bundle 字节数当成服务内存或请求延迟。

## 三、错误结构的增量：path 比一句“参数错了”更有用

`main.ts` 对同一批坏输入同时运行手写守卫和 schema：

```text
输入缺 orderId
手写: orderId missing
zod : [{"path":"orderId","msg":"Invalid input: expected string, received undefined"}]

输入 id 类型错误
手写: missing id/kind: {"id":42,...}
zod : [{"path":"id","msg":"Invalid input: expected string, received number"}]
```

对人来说，两种错误都能开始排查；对 Agent 来说，`path`、期望类型和实际类型可以直接进入下一轮修正。这个收益成立的前提是错误对象仍被当作不可信输入处理，不能把库内部 message 当成跨版本稳定 API。服务对外应继续包一层自己的 `error.code`。

## 四、取舍：schema 的成本要和信任边界对齐

| 场景 | 选择 | 原因 |
| --- | --- | --- |
| LLM/HTTP/队列输入 | schema | 外部数据必须运行时验证，错误需要结构化消费 |
| 多方共享协议 | schema + 自有错误合同 | 减少类型/校验/文档漂移 |
| 进程内已验证对象 | 直接使用类型 | 再次解析只增加 CPU 和代码路径 |
| browser 体积敏感 | 比较入口 + 实测 bundle | named import 是否有效由 bundler 和库的导出结构决定 |
| 热路径性能敏感 | 先 benchmark | 本机同语义 benchmark 见第四节，倍数有边界地使用 |

## 五、性能不能空口说：同语义 benchmark 的结果

上一版没有性能数字，结尾留了“先用 benchmark 再下结论”。`experiments/ts-interface-schema/bench/run-bench.mjs` 用同一批输入（合法 `lookup_order`、orderId 类型错误）分别跑手写守卫和 `zod/v4` named import 的分离式解析，每轮 2,000,000 次、预热 100,000 次，Node 24.19.0、Zod 4.4.3 本机连续两次：

| 输入 | 手写守卫 | zod/v4 | 倍数（zod/手写） |
| --- | ---: | ---: | ---: |
| 合法 | ~194–216M ops/s | ~20.2M ops/s | ≈0.09–0.10x |
| 非法（type mismatch） | ~0.51M ops/s | ~0.10M ops/s | ≈0.19–0.20x |

合法路径 zod 比手写慢约一个数量级；非法路径两者都受 throw/错误构造主导，差距缩到约 5 倍。这个差异本身不是“Zod 不好”的结论——它买的是结构化 path/code/错误对象和多语言互操作，不是单对象解析的绝对吞吐。取舍落在：解析频率 × 解析成本 是否值得热路径上省掉 schema。如果每秒只解析几百个对象，20M ops/s 远够用；如果 inner-loop 每秒解析百万级对象，这 10 倍差距就该写进设计评审。原始输出、脚本与环境见 `evidence/typescript-interface-schema-zod-bench/2026-08-19-local/`；单核同步解析、不含 JSON.parse 与网络/IO，倍数不是跨机器常数。

## 六、结论：单一事实源成立，性能结论需要自己的证据

当前工件支持的判断只有这些：

1. schema 可以同时生成运行时校验和 TypeScript 类型，减少协议漂移。
2. named imports 与 root import 在本次 esbuild 参数下产生不同 bundle，数字和压缩口径已保存。
3. 文章代码块现在可通过独立 `tsc --noEmit`，不再引用未导入的 `z`。
4. 错误 `path/code/message` 对 Agent 修正有用，但外层错误码仍需由服务自己稳定化。
5. 同语义 benchmark 数据已实测：合法路径 zod/v4 约慢一个数量级、非法路径约慢 5 倍（本机、单核、2M 次/轮）；它只约束本机同语义解析，不约束生产全链路。

读者可以先运行 `npm run typecheck` 和 `npm run bundle:sizes`，再用 `node bench/run-bench.mjs` 复测性能；把输入边界、构建参数和 benchmark 口径钉住后，才能谈库的成本。

## 参考资料

- [Zod API documentation](https://zod.dev/api)
- [esbuild：API options](https://esbuild.github.io/api/)
