---
title: "34 行写出权限弹窗：Pi 的「不内置功能」宣言背后的扩展 API"
description: "拆 Pi 的扩展面：79 个示例覆盖 subagents/plan-mode/permission-gate/sandbox/ssh，核心只留 4 个工具，其余全是 TypeScript 扩展模块 + 全生命周期事件钩子——为什么「功能可以后装」比「功能内置」更便宜，以及自修改（/reload）的闭环。"
publishedAt: "2026-08-20"
tags: ["Agent", "扩展", "开源"]
draft: false
featured: false
series: "Agent 的方方面面"
---

**TL;DR：** 01 篇的「刻意不做」清单如果只是宣传就毫无意义，但 Pi 用 3001 行的 extensions 文档 + 79 个官方示例证明了它是可兑现的架构承诺：每个被砍掉的功能都有扩展路径，其中权限弹窗只要 34 行（`examples/extensions/permission-gate.ts`），plan mode、subagents、sandbox、SSH 执行全部有官方示例。扩展 API 的核心是**与 agent loop 全生命周期对齐的事件钩子**（startup/session/agent/turn/tool 五组事件）加上 `registerTool`、`pi.sendUserMessage`、`ui` 等能力面。自修改（让 agent 写扩展、改自己、`/reload` 热加载）把这个架构推向闭环：**功能不是缺的，只是没在核心包里。**

## 一、扩展不是插件系统，是「第二套 loop 接口」

先看一个反直觉的事实：Pi 没有独立的"插件 SDK"。扩展就是**普通 TypeScript 模块**，导出默认函数 `(pi: ExtensionAPI) => void`，和 agent 跑在同一个进程里，共享同一套类型：

```ts
// examples/extensions/hello.ts（形态示意）
export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => { /* ... */ });
}
```

这意味着扩展能触碰的不是"官方开的几个洞"，而是 loop 本身的全部生命周期。`docs/extensions.md`（3001 行）按五组事件组织：

| 事件组 | 代表事件 | 扩展能干预什么 |
| --- | --- | --- |
| 启动 | `project_trust`、`resources_discover` | 信任决策、资源发现 |
| 会话 | `session_start`、`session_before_fork`、`session_before_compact` | 分支/压缩前拦截 |
| Agent | `before_agent_start`、`agent_start/end/settled`、`turn_start/end` | 每轮模型调用的前后 |
| 消息 | `message_start/update/end` | 流式增量、显示渲染 |
| 工具 | `tool_execution_start/update/end`、`context` | 调用前后门禁与改写 |

这套事件表和 02 篇的 loop 一一对应——`turn_end`、`tool_execution_end` 这些在 `agent-loop.ts` 里 `emit` 出来的事件，就是扩展的入口点。**扩展 API 不是另起炉灶，是把 loop 已经存在的事件流公开给第三方**。这是"第二套 loop 接口"的含义：你在 loop 里看到的每一个钩子，都对应一个扩展可以订阅的事件。

## 二、34 行的权限弹窗：被砍功能的范本

01 篇的清单里"刻意不做权限弹窗"，替代路径是"用扩展自己建"。范本就在官方 examples 里，34 行：

```ts
// examples/extensions/permission-gate.ts（节选）
const dangerousPatterns = [/\brm\s+(-rf?|--recursive)/i, /\bsudo\b/i, /\b(chmod|chown)\b.*777/i];

pi.on("tool_call", async (event, ctx) => {
  if (event.toolName !== "bash") return undefined;
  const command = event.input.command as string;
  if (dangerousPatterns.some((p) => p.test(command))) {
    if (!ctx.hasUI) {
      return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
    }
    const choice = await ctx.ui.select(`⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`, ["Yes", "No"]);
    if (choice !== "Yes") return { block: true, reason: "Blocked by user" };
  }
  return undefined;
});
```

拆开看它的工程含金量：`tool_call` 事件钩在 02 篇的 `beforeToolCall`（agent-loop.ts 行 619-647）上——拦截点在工具 schema 校验之后、执行之前；危险模式用正则而非黑名单字符串（`rm -rf`、`sudo`、`chmod/chown 777` 三个家族的宽松匹配）；**无 UI 环境下默认 block 而不是默认放行**（`ctx.hasUI` 分支——脚本/CI 场景最危险，所以默认拒绝）；返回 `{ block: true, reason }` 让模型看到被拒原因从而改走安全路径。整个功能不碰核心一行代码。

同批示例还有 `protected-paths.ts`（文件路径保护）、`sandbox/`（沙箱执行）、`plan-mode/`（计划模式）、`subagent/`（子 Agent）、`ssh.ts`（SSH 执行）、`custom-compaction.ts`（换压缩算法）、`todo.ts`（to-do 列表）、`confirm-destructive.ts`（破坏性操作确认）——**01 篇清单的每一项都能在 examples 里找到对应物**。

## 三、自修改：让 agent 改自己的工具，然后 /reload

扩展机制的最后一块是自我指涉：扩展能 `registerTool` 注册新工具（`dynamic-tools.ts` 演示运行中按需注册，配合 Kimi/Anthropic 的 deferred tool loading 还能保持 prompt cache）、能 `pi.sendUserMessage` 往会话里注入消息、能改自己的 TUI。而这一切的落点是**让 agent 修改自己的扩展文件后，`/reload` 热重载继续跑**——官网原话是"Pi can modify Pi"。

这个闭环的价值被大多数工具低估：不用等厂商实现你的 workflow，直接把 workflow 写进扩展文件，让 agent 自己迭代它。Databricks 基准里的"Omnigent 元 harness"想要做的事（模型与 harness 解耦、按任务换 harness），Pi 在单进程内用扩展 API 给了个人开发者同等的能力。

## 四、结论：功能的默认状态是「可后装」，不是「没有」

回到「刻意不做」：Pi 不是功能穷，而是**功能仓库**。权限弹窗 34 行、plan mode 是目录示例、子 Agent 是 tmux 或扩展——每个被砍的功能都有官方示例和文档锚点。这种"extensibility as default"的代价是：你需要会写 TypeScript 才能拿到这些能力，学习曲线从"开开关"变成"读 79 个例子"。收益是：核心 4 工具 + 1288 字符提示词 + 12.6k 行 agent-core 保持可读（01 篇的规模承诺），且任何团队都可以把策略层（权限、路径保护、命令审批）做成自己的扩展，而不是被厂商锁进内置功能。

验证三步：在 clone 的 `examples/extensions/` 里把 `permission-gate.ts` 复制成自己的扩展，用 `pi --extension` 加载，对一个 `rm -rf` 命令验证 block 与 reason；读 `dynamic-tools.ts` 的 `registerTool`，跑 `/add-echo-tool` 看运行中注册；打开 `docs/extensions.md` 的事件表，对照 `agent-loop.ts` 的 emit 调用点，数一数哪些事件是"扩展 API 独有"、哪些是"loop 原生事件"的直接透传。

## 参考资料

- `packages/coding-agent/docs/extensions.md`（3001 行）：五组事件、能力面、Quick Start
- `packages/coding-agent/examples/extensions/`（79 个示例）：permission-gate.ts（34 行）、protected-paths.ts、plan-mode/、subagent/、sandbox/、ssh.ts、custom-compaction.ts、dynamic-tools.ts
- `packages/agent/src/agent-loop.ts`：`beforeToolCall`/`afterToolCall` 钩子（行 619-647、724-751）——tool_call 事件的挂点
- earendil-works/pi @ commit 5cd93f6（2026-08-20 浅克隆实测）