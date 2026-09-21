---
title: "structuredClone 四语义：隔离真，函数拒收，类退化 plain"
description: "structuredClone 深隔离通过（改克隆不动原件），函数值抛 DataCloneError（非静默丢弃），类实例退化 plain 对象，Date/Map/循环引用保留。用 4 断言锁定，并说明它与 DTO 脱敏的边界。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-16"
tags: ["Node.js", "TypeScript", "语义", "深拷贝"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** `structuredClone` 四条语义全部实测：深隔离真（`[1,2]` vs `[1,2,3]`）、函数值抛 `DataCloneError`（不是静默丢）、类实例退化 plain（`instanceof` 丢、`greet` 丢、字段留）、Date/Map/循环引用保留。4 断言全过。接前文 [DTO 边界](/writing/typescript-dto-boundary)的结论：clone 解决引用隔离，不解决字段脱敏——两者是正交的两道工序。

## 一、合同

| 输入 | 行为 | 调用者注意 |
| --- | --- | --- |
| 普通对象/数组 | 深拷贝隔离 | 大对象有拷贝成本 |
| 函数值 | 抛 `DataCloneError` | 含回调的配置先剥离 |
| 类实例 | 退化 plain（方法丢） | 需行为时手动重建 |
| Date/Map/Set/循环 | 保留语义 | 跨 realm 仍可用 |

最容易踩的是 C2→C3 的组合：以为“函数被去掉、类还在”，实际是“函数直接抛错、类只剩字段”。

## 二、实测

```js
// 形态（experiments/node-clone-semantics/clone.mjs）：值保留，函数拒收
const c = structuredClone({ d: new Date(), m: new Map() }); // Date/Map 保留
structuredClone({ f: () => {} }); // 抛 DataCloneError，不是静默丢
```

`experiments/node-clone-semantics/clone.mjs`，`evidence/node-clone-semantics/2026-09-14-local/run.out`，5 PASS。加固 C5：`transfer` 转移 ArrayBuffer 所有权——原件字节数归零，克隆体接管。拷贝与转移是两种语义，worker 间传大内存必须显式 transfer，否则复制成本翻倍。

## 三、证据卡与边界

环境 Node v24.19.0。不支持：跨线程/跨进程 transferable、性能对比 JSON 序列化。

## 参考资料

- MDN：structuredClone，<https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone>（2026-09-14 核对）；可克隆类型表，<https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm>
- 前篇：TypeScript DTO 边界，`/writing/typescript-dto-boundary`
