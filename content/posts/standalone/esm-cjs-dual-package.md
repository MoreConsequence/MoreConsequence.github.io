---
title: "ESM/CJS 双包不是发行策略，是分辨率合同：exports 字段的三层语义"
description: "本机实验：exports 条件分发让 ESM/CJS 各得所需；删掉 exports 后 ESM 具名导入 CJS 报 Named export 错误；同一进程双实例时状态互不可见——双包陷阱的机理与出口。"
publishedAt: "2026-08-19"
tags: ["Node.js", "工程实践", "前端"]
draft: false
featured: false
---

**TL;DR：** `package.json` 的 `exports` 字段不是"谁能导入我"的开关，是**三套分辨率合同的唯一权威**：条件分发（`import`/`require` 各指向自己的文件）、路径映射（`./sub` 授权子路径）、以及**产物互斥**（同一代码一个进程只应加载一份）。本机实测三幕：① 有 `exports` 时 ESM 与 CJS 消费者各自拿到自己的产物；② 删掉 `exports` 只剩 `main` 后，ESM 具名导入 CJS 直接 `SyntaxError: Named export not found`；③ 用 `createRequire` 强制同进程双实例——两个模块实例状态互不可见（ESM 侧 `state=2`、CJS 侧 `state=1`），这就是著名的**双包陷阱**。结论：单例状态（连接池、配置、缓存）跨双包 = 双双作废，`exports` 字段是这种事故的第一道也是最后一道闸。

## 一、exports 的完整合同：三种字段三层语义

| 字段 | 管什么 | 没写时行为 |
| :--- | :--- | :--- |
| `main` + `type` | 入口 + 语法模式（CJS/ESM） | Node 默认按此加载 |
| `exports["."]` | 主入口的条件分发 | 退回 main（坑在这） |
| `exports["./x"]` | 子路径白名单 + 分发 | **任意子路径都能被 require**（历史包袱） |

本文聚焦最容易被低估的一条：**`exports["."]` 是"谁在什么条件下拿哪份产物"的分发器**。双包陷阱的三幕实验完整展示了它存在的必要性。

## 二、实验三幕：每个坑都是 exports 缺位

实验目录 `experiments/esm-cjs-dual-package/demo/`，`node_modules/dual-pkg` 手工构造三态（同一包换三次 package.json）：

**第一幕：条件分发正常。** `exports` 写 `{ ".": { import: "./index.mjs", require: "./index.cjs" } }`。ESM 消费者 `import { kind }` 得到 `ESM`；CJS 消费者 `require()` 得到 `CJS`——各得所需，这是 Node 的推荐写法（官方 docs 称为"双包发行"）。

**第二幕：删掉 exports。** 只剩 `main: "./index.cjs"`（含 `type: module`）。CJS 消费者照常工作；**ESM 消费者具名导入直接抛 `SyntaxError: Named export 'hi' not found`** ——Node 对 CJS 的 ESM 互操作默认只提供 `default`（`module.exports`），具名导出依赖静态分析推断，失败就失败。这解释了大批量 CJS 库在 ESM 项目里的经典报错来源。

**第三幕：双包陷阱。** 同一进程内 `import from "dual-pkg"` 拿 ESM 实例，`createRequire(import.meta.url)` 拿 CJS 实例：

```
ESM 实例 state: 2 | CJS 实例 state: 1
两份实例, 状态互不可见: 是(双包陷阱)
```

ESM 实例上了两次计数器、CJS 实例上一次，两者各回各家。**这就是双包陷阱的机理**：同一个包的双份产物在依赖树里各被加载一次（一个 ESM 依赖 import 它、一个 CJS 依赖 require 它），只要包里有模块级可变状态——单例连接、配置缓存、全局注册表——就会看到"我 set 了但别人 get 不到"的幽灵 bug。`createRequire` 只是复现手段，真实场景是依赖树分叉，跟你的代码有没有写 `createRequire` 无关。

## 三、双包陷阱为什么是"状态分叉"而不是"两倍内存"

先纠正一个常见误读：双包陷阱不是"多占两倍内存"这么轻——是**语义分叉**。两份实例各有自己的模块作用域，`instanceof`、`Symbol` 单例、连接池复用、装饰器注册全部失效。本实验用计数器证明的是状态互不可见性：任何"全局唯一"的东西在双包下都是两份。典型症状清单：

* 连接池：ESM 侧建立、CJS 侧永远看不到复用 → 每条请求新建连接；
* 事件发射器/注册表：一边 `register()` 另一边 `emit()` 收不到 → 插件框架式 bug；
* 单例配置 + env 覆盖：两边读到不同的初始值 → "我在 A 环境改了没生效"。

识别方法：`node --trace-warnings` 或检查 `require.cache` / `import.meta` 下同包是否出现两份解析路径（`node_modules/dual-pkg/index.mjs` vs `index.cjs` 同时存在）。根因是 package.json 的 exports 把"两套产物"合法化了——**合法不意味着安全，只有消费方保证"同一进程只取一个分支"才安全**。

## 四、工程出口：何时该双包、何时该单包

| 包的性质 | 建议 |
| :--- | :--- |
| 无模块级状态（纯函数/类型/常量） | 双包安全；仍要写 exports 且两产物语义一致 |
| 有单例状态（连接池、注册表、配置） | **单包**：只发一种产物（任选），让所有消费方走同一条路径 |
| 被 CJS 旧依赖树必须兼容 | 单包发 CJS + `exports` 里给 ESM 复用同一 CJS 文件（default 导入），不产第二份实例 |

关掉双包的实操：`exports["."]` 只写一个 target（比如只 `require`），ESM 消费者会拿到 CJS 的 default 互操作——具名导入可能失败，改成 `import pkg from "x"` 即可。**成本是一次性重命名 import，收益是单例语义永久成立**。想要"ESM 新语法便利 + 单实例"，可以保持双产物但用 `--conditions` 或构建期只保留一份，但任何方案都逃不脱同一条底线：**一个进程里只能存在一份可观察的状态**。这跟锁和并发里的"一个资源一个 owner"是同一句话，见 [事务隔离不是靠锁](/writing/mvcc-isolation-snapshot) 的同构性。

复现：`experiments/esm-cjs-dual-package/demo/`（纯 Node，无依赖），三幕输出与运行环境见 `evidence/esm-cjs-dual-package/2026-08-19-local/`。Node 24 的解析行为即本实验依据；`SyntaxError` 的具名导出推断在不同 Node 版本细节上有差异（cjs-module-lexer 版本），但"默认只有 default"的互操作模型跨版本稳定。

## 五、结论：exports 不是选项，是合同

三幕实验给同一个教训：**ESM/CJS 共存的正确性由 package.json 的 `exports` 决定，而它被省略时，Node 用 `main` + `type` 的旧默认值兜底——那个兜底恰好是各种坑的入口**（具名导出失败、双包陷阱）。把 `exports` 当作发行版本的必填项：写条件分发、白名单子路径、并把"单例状态只允许一份产物"写进包作者的 README。消费者侧则是另一种纪律：运行时出现"状态不一致"，第一反应查依赖树里有没有双包，而不是怀疑时序。

下一步可执行：`node -e "console.log(require.resolve('<包名>/package.json'))"` 列一下你项目的关键单例库（连接池、orm、cache），确认它们没有被同时 import 和 require；给 package.json 的 exports 加 lint 规则（缺 exports 的库在 CI 报 warning），胜于事后再查。

## 参考资料

- [Node.js ESM 文档](https://nodejs.org/api/esm.html)（模块解析、双包 hazards）
- 本仓库实验：`experiments/esm-cjs-dual-package/`；原始输出：`evidence/esm-cjs-dual-package/`
