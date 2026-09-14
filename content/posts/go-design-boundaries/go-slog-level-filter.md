---
title: "log/slog 三断言：Debug 默认不出，With 透传，输出是 JSON"
description: "slog JSON handler 在 Info 级别下过滤 Debug、保留 Info 并输出合法 JSON（含 level 与自定义字段），With 字段透传每条记录。用 3 测试锁定，并说明级别开关与字段约定的归属。"
publishedAt: "2026-09-14"
tags: ["Go", "可观测性", "日志", "标准库"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** `slog.NewJSONHandler(w, {Level: Info})` 下 `Debug` 被过滤、`Info` 输出合法 JSON（`level:"INFO"` + 自定义字段），`.With("tenant","acme")` 透传每条记录。3 测试全过。结论：级别是部署配置（环境变量→Level），字段是代码契约（`With` 在入口统一加），两者别混在一起 hardcode。

## 一、合同

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 级别 | 低于 Level 的记录丢弃 | 丢弃可回放 | Level 来自配置，不是常量 |
| 字段 | `With` 透传、JSON 可机读 | 字段命名统一（`tenant` vs `tenant_id`） | 字段字典文档化 |
| 性能 | 按需序列化 | 零开销（参数求值仍在调用处） | 热路径用 `LogAttrs` 延迟求值 |

## 二、实测

`experiments/go-slog-filter/slog_test.go`，`evidence/go-slog-filter/2026-09-14-local/run.out`，3 PASS。

## 三、证据卡与边界

环境 Go 父模块工具链。不支持：生产日志量 benchmark、otel 桥接。

## 参考资料

- Go 文档：log/slog，<https://pkg.go.dev/log/slog>（2026-09-14 核对）
