---
title: "A2A 委派链：coder 按卡转包，reviewer 只见子任务"
description: "卡发现的下一步：coder 把 review 子任务按卡委派给 reviewer 再组装返回，reviewer 只收到子任务输入，越权直调被拒。用双对等体 3 断言验证委派边界。"
publishedAt: "2026-09-14"
tags: ["AI Agent", "A2A", "多智能体", "协议设计"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 发现之后是委派：coder 接到 `codegen` 后自己打补丁，按卡找到 reviewer，把 `review` 子任务转包出去再组装返回。3 断言全过，其中 D2 是核心——reviewer 只看到 `patch:fix-retry`，看不到原始任务。委派边界 = 最小输入原则的协议实现。

## 一、完整路径：一次委派走完什么

```text
client → coder: codegen(fix-retry)
  → coder 自做 patch
  → coder 拉卡找 skills 含 review 的对等体
  → coder → reviewer: review(patch)（只给子任务输入）
  → reviewer → coder: LGTM:patch
  → coder → client: {patch, review}
```

## 二、合同

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 输入隔离 | 下游只见子任务 | 下游不反推上游（patch 里可能带信息） | 子任务输入脱敏 |
| 能力边界 | 越权直调 400 | 委派链无限深 | 最大委派深度（防循环转包） |
| 组装 | 发起方组装最终结果 | 结果一致性 | 部分失败时的补偿 |

循环转包（A→B→A）是本篇未覆盖的坑：能力边界只防越权，不防环，需另加深度预算（见 dsh 子智能体篇的 Delegation Depth）。

## 三、实测

`experiments/a2a-delegate-chain/chain.mjs`，`evidence/a2a-delegate-chain/2026-09-14-local/run.out`，3 PASS。

## 四、证据卡与边界

环境 Node v24.19.0，进程内双对等体。不支持：真实 A2A SDK、多跳授权、循环转包防护。

## 参考资料

- 前篇：A2A 卡发现，`/writing/a2a-agent-card-discovery`
- A2A 官方文档，<https://a2a-protocol.org/>
