---
title: "Go 1.27 timer 通道恒同步：cap 0、恰好一次、Stop/Reset"
description: "Go 1.27 起 timer 通道恒为同步无缓冲：time.After 通道 cap 必为 0、恰好投递一次，Stop 阻止触发、Reset 复用。用 3 测试锁定，并说明旧 asynctimerchan 逃生舱已移除的含义。"
publishedAt: "2026-09-14"
tags: ["Go", "运行时", "并发", "time"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** Go 1.27 的 timer 通道永远同步：`cap(time.After(d)) == 0`（已断言）、恰好投递一次、未触发前 `Stop` 返回 true 且不再触发、`Reset` 可复用。3 测试全过。含义：`for { select { case <-time.After(x): } }` 的旧泄漏叙事（1.23 前 GC 回收警告）彻底终结，但循环内 `time.After` 仍在堆上分配 Timer——高频循环改用 `NewTimer` + `Reset`。

## 一、合同

| 语义 | 保证 | 调用者仍负责 |
| --- | --- | --- |
| 同步 | 通道无缓冲，发送方（runtime）与接收方会合 | 接收侧必须及时读，否则 timer 协程阻塞（但 runtime 侧无泄漏） |
| 恰好一次 | 一个 Timer 只投递一个值 | 超时分支与正常分支的竞态仍自己处理 |
| Stop | 未触发前调用返回 true 且保证不触发 | 已触发后返回 false，通道里可能已有值（需排空） |
| Reset | 复用同一 Timer，无需重建 | Reset 前确认旧状态（Stop + 排空是标准三连） |

## 二、实测

`experiments/go127-timer/timer_test.go`，`evidence/go-timer-sync/2026-09-14-local/run.out`，3 PASS。注意 `asynctimerchan` 逃生设置已移除——“改回异步”这条路不存在，同步是唯一语义。

## 三、证据卡与边界

环境 Darwin arm64 + go1.27.1。不支持：生产 timer 延迟分布、高频分配 benchmark（另起一篇）。

## 参考资料

- Go 1.27 发布说明（timer 同步节），<https://go.dev/doc/go1.27>
