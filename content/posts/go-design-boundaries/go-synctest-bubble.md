---
title: "testing/synctest：Sleep 一小时的并发测试毫秒级跑完"
description: "synctest.Test 气泡内虚拟时钟：Sleep(1h) 瞬时完成，Wait 断言除测试体外全阻塞，双气泡时钟互不干扰。用 3 测试锁定，并说明网络与外部进程禁区。"
publishedAt: "2026-09-14"
tags: ["Go", "并发", "测试", "标准库"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** `synctest.Test` 把测试包进气泡： bubble 内 `time.Sleep(time.Hour)` 瞬时走完（含 30 分钟后的 channel 投递），`synctest.Wait()` 返回即“除测试体外全阻塞”，双气泡时钟各自从 UTC 2000-01-01 午夜起步互不干扰。3 测试全过（0.4s 内）。禁区同样明确：别碰网络、外部进程和气泡外 goroutine——虚拟的是时间，不是世界。

## 一、合同

| 维度 | 气泡内保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 时间 | 虚拟，Sleep 立即推进 | 真实耗时测量 | 性能 benchmark 仍用真时钟 |
| 阻塞 | `Wait` 断言全阻塞 | 死锁自动定位（只告诉你卡住） | 超时与取消逻辑自己写 |
| 隔离 | 双气泡时钟独立 | 与外部世界交互 | fake 网络/时钟注入 |

## 二、实测

`experiments/go127-synctest/sync_test.go`，`evidence/go-synctest/2026-09-14-local/run.out`，3 PASS。注意入口是 `synctest.Test(t, …)` 不是 `Run`，以及气泡起点是 UTC 午夜（本地 +0800 下 `Hour()` 断言会错，要用 UTC 比）。

## 三、证据卡与边界

环境 Darwin arm64 + go1.27.1。不支持：真实网络并发、生产竞态复现（配合 `-race` 另测）。

## 参考资料

- Go 文档：testing/synctest，<https://pkg.go.dev/testing/synctest>（2026-09-14 核对）
