---
title: "JavaScript 结构化克隆算法深度剖析：structuredClone 五大核心语义与所有权转移"
description: "JSON 序列化克隆存在类型丢失与循环引用崩溃的顽疾。本文系统拆解 HTML 标准 structuredClone 的深层内存隔离、函数拒绝、类原型退化、循环引用拓扑保留以及 Transferable 零拷贝转移机制。"
publishedAt: "2026-09-14"
updatedAt: "2026-10-21"
tags: ["JavaScript", "TypeScript", "Node.js", "structuredClone", "内存管理"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** 长期以来，JavaScript 开发者依赖 `JSON.parse(JSON.stringify(obj))` 进行深拷贝。这一黑魔法存在诸多致命缺陷：它会将 `Date` 静默退化为纯文本字符串、将 `Map` 与 `Set` 变成空对象 `{}`、直接丢弃 `undefined`，且在遇到循环引用时立即抛出 `TypeError` 崩溃。Web 平台与 Node.js 17+ 原生支持的 `structuredClone` 实现了标准的结构化克隆算法。其实测表现出五大核心语义：真正的深层内存完全隔离；对函数值显式抛出 `DataCloneError` 拒绝克隆；类实例保留数据字段但原型链断开并退化为 Plain Object；原生保留 `Date`、`Map`、`Set` 与循环引用的图拓扑结构；支持通过 `transfer` 列表实现 `ArrayBuffer` 的零拷贝所有权剥离（原件直接脱水置空）。

## 一、传统 JSON 深拷贝的六大破损陷阱

在很长一段时间里，深拷贝一个复杂状态对象常被简写为序列化再反序列化：

```js
const clone = JSON.parse(JSON.stringify(original));
```

这种做法在处理纯标量数据时看似正常，但在企业级 TypeScript 项目中，它破坏了六大核心数据不变量：

| 数据类型或结构 | `JSON.parse(JSON.stringify())` 表现 | `structuredClone()` 原生表现 |
| --- | --- | --- |
| `Date` 对象 | 静默退化为 ISO-8601 字符串，原型丢失 | 保持为独立的 `Date` 实例，毫秒时间戳严格一致 |
| `Map` 与 `Set` | 静默退化为 `{}` 空普通对象，数据全丢 | 保持为原生的 `Map` / `Set`，迭代器与方法完整 |
| 循环引用对象 | 抛出 `TypeError: Converting circular structure` | 正确还原图的拓扑闭环，内存地址不发生死循环 |
| `BigInt` 数值 | 抛出 `TypeError: Do not know how to serialize` | 原生深拷贝大整数，精度零损失 |
| `undefined` 字段 | 键名直接被静默删除 | 严格保留键名与 `undefined` 值 |
| `ArrayBuffer` | 变成普通数组或丢失二进制特性 | 完整克隆内存，支持零拷贝 `transfer` |

## 二、`structuredClone` 的五大核心运行时语义

通过针对 V8 运行时的确定性测试，`structuredClone` 的底层行为收敛为五项明确的系统契约。

### 1. 深度内存隔离（Deep Memory Isolation）

克隆不仅发生在最外层对象，所有嵌套的内部对象和数组均分配全新的独立内存堆地址。
修改克隆体内部任意层级的数组或字典，原始对象均保持完全不变。

```js
const source = { user: { tags: ["dev", "lead"] } };
const cloned = structuredClone(source);

cloned.user.tags.push("admin");
console.log(source.user.tags.length); // 依然严格为 2
console.log(cloned.user.tags.length); // 为 3，证明深层解耦
```

### 2. 函数值的强防御性拒收（Rejection via DataCloneError）

结构化克隆算法本质上服务于跨进程、跨 Worker 或跨线程的序列化传输。
闭包函数通常捕获了当前执行栈的变量作用域，在物理内存上无法脱离宿主上下文安全传输。
因此，算法不对函数进行静默忽略，而是直接抛出 `DOMException: DataCloneError`。

```js
try {
	structuredClone({ id: 1, calculate: () => 42 });
} catch (err) {
	console.log(err.name); // 输出 "DataCloneError"，绝不静默吞掉方法
}
```

### 3. 类实例的原型退化（Prototype Severing）

这是重构中极易引发逻辑 Bug 的边界：
若克隆一个自定义类（Class）的实例，算法会递归拷贝其持有的所有公有数据字段，但**不会克隆其原型链（Prototype Chain）**。

```js
class Account {
	constructor(id) {
		this.id = id;
	}
	balance() {
		return 100;
	}
}

const acc = new Account("A1");
const clonedAcc = structuredClone(acc);

console.log(clonedAcc.id); // "A1" (数据完整)
console.log(clonedAcc instanceof Account); // false (原型丢失)
console.log(typeof clonedAcc.balance); // "undefined" (方法不存在)
```

克隆后的产物是一个 Plain JavaScript Object（字面量对象）。若业务代码后续调用类成员方法，将抛出 `TypeError: clonedAcc.balance is not a function`。

### 4. 循环引用与富类型的图拓扑保留

结构化克隆内部维护了一个访问备忘表（Memory Hash Table）。
当遇到自身引用自身、或者多层循环嵌套时，算法能够识别已经处理过的节点指针，在目标副本中精确建立对应指向，而不会陷入栈溢出崩溃。

```js
const nodeA = { name: "A", date: new Date() };
const nodeB = { name: "B", peer: nodeA };
nodeA.peer = nodeB; // 构造循环引用图

const clonedGraph = structuredClone(nodeA);
console.log(clonedGraph.peer.peer === clonedGraph); // true，图拓扑结构完美还原
console.log(clonedGraph.date instanceof Date); // true
```

### 5. Transferable 对象的零拷贝所有权转移

在高性能多线程通信中，深拷贝数十兆的二进制大对象（如 WebGL 纹理、音视频采样 Buffer）会消耗大量 CPU 与内存。
`structuredClone` 第二个可选参数支持 `transfer` 数组：

```js
// 分配 8 字节的二进制内存缓冲区
const rawBuffer = new ArrayBuffer(8);

// 转移所有权给克隆体
const payload = structuredClone({ data: rawBuffer }, { transfer: [rawBuffer] });

console.log(rawBuffer.byteLength); // 0！原内存被彻底“脱水”掏空
console.log(payload.data.byteLength); // 8！新对象直接接管底层物理内存
```

该操作是常数级 \( O(1) \) 的指针移交，底层物理内存无需发生任何字节拷贝，是 Node.js Worker 线程间传递大载荷的核心基石。

## 三、工程选型与实践避坑准则

在实际架构中，应根据场景选择最合适的复制策略：

| 业务场景 | 推荐方案 | 核心理由 |
| --- | --- | --- |
| 纯 DTO、JSON 数据持久化或日志清洗 | `structuredClone()` | 安全保留 `Date` 与基础类型，杜绝意外内存引用 |
| 包含类方法、领域实体的领域模型 | 手写 `clone()` 方法或工厂拷贝 | 显式重新绑定原型链与依赖注入 |
| 跨 Worker 线程传输二进制大文件 | `structuredClone(obj, { transfer })` | 零拷贝内存移交，保护主线程 GC 与吞吐 |
| 极低延迟要求下的浅层更新 | 展开运算符 `{ ...obj }` | \( O(1) \) 纳秒级完成，仅拷贝最外层引用 |

## 四、验证实验与边界说明

本机制在 `experiments/node-clone-semantics/clone.mjs` 中通过 Node.js 原生运行了 5 项断言：
- 断言 C1：嵌套数组深层隔离，修改克隆体对原件零影响。
- 断言 C2：包含匿名函数的值被严格拦截，抛出 `DataCloneError`。
- 断言 C3：类实例克隆后 `instanceof` 返回 false，成员方法丢失但数据字段完好。
- 断言 C4：包含 `Date`、`Map` 与自身循环引用的复杂对象正确还原类型与拓扑。
- 断言 C5：传递 `transfer` 参数后，原始 `ArrayBuffer` 字节长度确定性变为 0，目标对象完整接管 8 字节。

## 参考资料

- MDN Web Docs: `structuredClone()` (<https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone>)
- HTML Living Standard: Structured Cloning Algorithm (<https://html.spec.whatwg.org/multipage/structured-data.html#structured-cloning>)
- Node.js Documentation: Transferable Objects in Worker Threads (<https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist>)
- 站内对照：Node.js 原生 SQLite 与参数化绑定，`/writing/node-sqlite-builtin`
- 架构演进：SharedArrayBuffer 与 Atomics 无锁多线程通信，`/writing/node-shared-memory-atomics`
