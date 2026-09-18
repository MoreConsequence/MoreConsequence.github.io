---
title: "Go 测试两件套：虚拟时钟与模糊测试"
description: "synctest.Test 气泡内 Sleep(1h) 瞬时完成、Wait 断言全阻塞；fuzz 0.4 秒抓到空 key 真 bug，修完 30 秒 970 万次确认。两组断言全过，同一主题：把 flaky 与漏测挡在合入前。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-18"
tags: ["Go", "测试", "并发", "fuzz"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 两件套解决测试的两类不可靠：`synctest.Test` 用虚拟时钟让 `Sleep(time.Hour)` 的并发测试毫秒级跑完，`Wait()` 返回即除测试体外全阻塞；fuzz 在单测全绿的解析器上 0.4 秒抓到 `"=1"` 空 key 漏网，修完语料入库，30 秒 970 万次零新增。两组断言全过（3+单测回归）。

## 一、synctest：虚拟的是时间，不是世界

入口是 `synctest.Test(t, …)`（不是 `Run`）；气泡时钟起点固定 UTC 2000-01-01 午夜（本地 +0800 下按 UTC 断言）；禁区是网络、外部进程与气泡外 goroutine（`experiments/go127-synctest/sync_test.go`），3 PASS。

## 二、fuzz：找你没想到要测什么

只允许两类结局——受控 `badErr` 或合法结果，panic 与非法结果即红。不变量写多严 fuzz 就有多大用。找修闭环：抓获→修空 key 拒绝→语料 `testdata/fuzz/FuzzParse/4b062e0b6030ffd3` 入库→回放通过→30s 确认（`experiments/go-fuzz-parser/fuzz_test.go`）。

## 三、证据卡与边界

原始输出：`evidence/go-synctest/`、`evidence/go-fuzz-parser/`（2026-09-14-local）。不支持：真实网络并发、CI 夜间长 fuzz、非纯函数目标。

## 参考资料

- Go 文档：testing/synctest、fuzzing，<https://pkg.go.dev/testing/synctest>、<https://go.dev/doc/fuzz/>（2026-09-14 核对）
- 站内 benchmark 卫生：[Go benchmark 避坑](/writing/go-benchmark-pitfalls)（-benchmem、benchtime 与 profile 字节的正确读法）
