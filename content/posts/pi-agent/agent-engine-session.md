---
title: "会话是树不是日志：Pi 的分支、版本迁移与崩溃自愈"
description: "拆 Pi 的会话层：JSONL 文件里的树结构（id/parentId）、五个版本跨代自动迁移、/tree 分支语义、branch summary，以及 crash 后如何原子地修复被拦腰截断的会话文件。"
publishedAt: "2026-08-20"
updatedAt: "2026-08-23"
tags: ["Agent", "会话", "开源"]
draft: false
featured: false
series: "Agent 的方方面面"
---

**TL;DR：** 会话是 Agent 的持久层，Pi 把它实现成"JSONL 文件 + 树结构"：每条消息带 `id`/`parentId`，分支存在同一个文件里，`/tree` 可以回到任意历史节点重新出发；文件格式已有 v1→v4 四代版本，加载时自动迁移；最不为人知的是崩溃自愈——写会话写到一半进程被杀，留下的"半行 JSON"会在下次加载时被识别为 torn tail，用 `.tmp` 文件 + 原子 rename 把有效前缀发布回去。本文从文件格式讲到崩溃修复，回答"Agent 的状态到底存在哪里、怎么保证不丢"。

## 一、会话是 Agent 的持久层：三个要求

02 篇说过，loop 靠"检查点之后可重跑"维持优雅：失败时上下文整体在 context 里，直接退场即可。但 context 在内存里，进程一死就没了。会话层的职责是让它跨进程存活，Pi 为此提出三个要求：

1. **可继续**：上次没干完的活，重开进程还能接上；
2. **可回溯**：Agent 走错路了，能回到任何一个历史节点重来，而不是只能删掉重来；
3. **不损坏**：写一半崩溃（断电、kill -9）不该毁掉整个会话。

Pi 的答案就在 `packages/coding-agent/docs/sessions.md` 和 `docs/session-format.md`（438 行）里：会话存为 `~/.pi/agent/sessions/` 下的 JSONL 文件，一个文件就是一棵树。

## 二、JSONL + 树：文件格式的两次关键决策

**决策一：JSONL 而不是 JSON。** 每行一个 JSON 对象，带 `type` 字段（消息、模型切换、thinking 切换、compaction、branch summary、label、扩展条目）。追加只发生在文件尾部——这是追加式日志的本质，也是后面崩溃自愈能成立的前提。

**决策二：树而不是线。** 每条 entry 带 `id` 和 `parentId`（v2 起）：

```text
├─ user: "Hello, can you help..."
│  └─ assistant: "Of course! I can..."
│     ├─ user: "Let's try approach A..."  →  …成品了（active leaf）
│     └─ user: "Actually, approach B..."  →  同一条胡同里分叉
```

分支不新建文件，就在原文件里长出来。`/tree` 是分支导航器：跳到任何历史节点，从那里继续，形成新分支；已成型分支的消息在文件里完好保留，不因"选中了另一条路"而丢失。

配套三个命令划分得很细：`/tree` 原地探索备选方案（同一会话文件）；`/fork` 以某个更早的用户消息起点开新会话文件；`/clone` 把当前活动分支整体复制成新文件（继续实验前先备份当前状态）。**"去哪分叉"与"要不要新文件"是两个独立决定**——这是很多人做会话恢复时没想到的维度。

## 三、四代格式与自动迁移：向后兼容是会话的底线

格式版本是会话文件头部的 `version` 字段（`session-format.md`）：

- **v1**：线性 entry 序列（legacy）；
- **v2**：树结构（`id`/`parentId` 链接）；
- **v3**：`hookMessage` 角色改名为 `custom`（扩展统一）；
- **v4**：lane-based Session（0.84.0 的 v4 Session API，session-backends 包，含 SQLite 后端 *）——注意 v4 是 harness API 层面的换代，会话文件的 JSONL 结构仍保持 v3 兼容线。

**加载时自动迁移**（"Existing sessions are automatically migrated to the current version when loaded"）。你两年前的会话文件现在打开它，仍然是那棵树。对 harness 而言，用户的会话愿意随手保存的前提就是"这文件永远不会因为升级读不了"——版本迁移是承诺，不是选项。

## 四、Branch summary：离开的分支，留下一张便签

树会越分越深，而模型只能沿一条路径思考。分支摘要解决"离开时另一条路的信息怎么办"：`/tree` 切换到另一分支时，Pi 可以把被放弃的分支归纳成摘要，附着在新位置（可选：不摘要 / 默认提示摘要 / 带自定义聚焦指令摘要）。

它与 compaction（03 篇）共享同一套结构化摘要格式，但触发点不同：compaction 是"上下文超预算"，branch summary 是"路径切换"。被放弃分支不必重放，但结论不丢——**树的记忆是语义的，不是字节的**。

## 五、崩溃自愈：半行 JSON 与原子 rename

这是 Pi 会话层最值得抄回自己系统的细节，实现位于 [`packages/agent/src/harness/session/jsonl/storage.ts`](https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/session/jsonl/storage.ts)（277 行，08-23 复测未变）。

写入路径本身是普通追加（`appendFile`），打不了一点：进程在写某行期间崩溃，文件尾部会留下"半个 JSON 行"——既不是合法 entry 也不是干净结尾。常规做法是"检测到坏行就丢整个文件"或"手动清理"，Pi 的做法分三步：

```ts
// storage.ts 加载路径（骨架）
const isTornTail = index === lastLine && error.kind === "syntax";
if (isTornTail) {
  // 1. 把"最后一行"判定为未确认的部分追加
  // 2. 有效前缀（完整行们）写进 .tmp 文件
  // 3. 原子 rename 覆盖原文件 —— publishFileAtomically()
}
```

`publishFileAtomically`（storage.ts 行 33 起）的注释写得明明白白："先构建一个完整的兄弟临时文件，再原子地 rename 到目标位置；rename 提交前目标文件不受影响，所以进程崩溃最多留下一个可忽略的 `.tmp` 文件。"

这里有一个优雅的语义选择：**只有"最后一行 + 语法错误"才被宽容地当作 torn tail 丢弃**；中间任何一行损坏则直接抛 `invalidFile`，绝不静默修复。为什么？尾部是唯一不可能被"已完成、已持久化"的位置——中间的坏行意味着前面的修复/写入承诺可能已经违反，这时候诚实报错比假装修好更安全。宽容与严格各自只在一个位置成立：尾部宽容，腰腹严格。

（配套的是 harness 文件系统的 `renameFile()` 契约——0.84.0 发布说明里专门要求自定义文件系统实现"同文件系统替换语义"，因为原子发布依赖 rename 的原子性。这是把文件系统的特性当成 API 契约来对待的例子。）

## 六、结论：会话层是"不丢"与"可回溯"的工程，不是数据库选型

把四代格式、树结构、分支摘要、torn-tail 修复放在一起看，Pi 的会话设计回答的是两个问题：**状态怎么长存**（JSONL 追加 + 原子发布 + 尾部自愈），**历史怎么利用**（树 + 分支摘要，而不是线性重放）。它没有引入任何数据库，却通过"追加式文件 + 一条严格规则（尾部宽容、中间严格）"做到了 crash-safe 的可回溯历史。

下一步可亲手验证：开一个会话干几步活，`kill -9` 正在跑 Agent 的进程，重启后用 `/resume` 打开——注意看日志里的 torn-tail 修复；再在 clone 里读 `storage.ts` 的 `load()`，把 `isTornTail` 判定条件改成"任意行错误都继续"，跑测试看 `invalidFile` 是如何在中间行被触发的，体会"尾部宽容、中间严格"的差别。

## 参考资料

- `packages/coding-agent/docs/sessions.md`（145 行）、`docs/session-format.md`（438 行）、`docs/compaction.md`（418 行），earendil-works/pi @ b23741269（2026-08-23 复测；基线 5cd93f6）
- `packages/agent/src/harness/session/jsonl/storage.ts`（277 行）：torn-tail 判定（行 84-90）与 `publishFileAtomically`（行 33 起）
- 0.84.0 发布说明：v4 Session API、`JsonlSessionRepo`、`FileSystem.renameFile()` 契约（pi.dev/news/releases/0.84.0）
- `packages/session-backends/`（sqlite-node 实验后端）与 `packages/agent/src/harness/session/`（memory/jsonl 两个内置后端）