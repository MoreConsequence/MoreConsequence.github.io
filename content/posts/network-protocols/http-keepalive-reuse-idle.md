---
title: "HTTP keep-alive 三个数：10 请求 1 连接、禁用 10 连接、闲 300ms 变 2 连接"
description: "默认 Transport 复用下 10 请求只建 1 连接，DisableKeepAlives 后 10 请求建 10 连接，服务端 IdleTimeout 100ms 时闲置 300ms 即重拨。用 ConnState 计数锁定，并区分 HTTP 保活与 TCP keepalive。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-14"
tags: ["网络", "HTTP", "Go", "性能"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** HTTP keep-alive 管的是“连接复用”，不是“连接存活”：默认复用下 10 请求只建 1 连接，禁用后 10 请求建 10 连接，服务端空闲超时 100ms 时闲置 300ms 即重拨变 2 连接。3 测试全过。别把它和 TCP keepalive（SO_KEEPIDLE 存活探测，分钟级）混为一谈——一个省握手，一个探死对端。

## 一、合同

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 复用 | 同 Transport 空闲连接复用 | 连接永远不换（服务端可随时关） | 重试幂等（复用连接上失败要能重发） |
| 空闲超时 | 服务端 IdleTimeout 关闲连接 | 客户端提前知道（下一个请求才重拨） | 客户端超时与服务端超时对齐 |
| 禁用 | 每次建连，用完即关 | 性能（握手 + 慢启动全付） | 只在连接数可观测场景用 |

## 二、实测

`experiments/http-keepalive/keepalive_test.go`（`ConnState/StateNew` 计数），`evidence/http-keepalive-reuse/2026-09-14-local/run.out`，3 PASS。

## 三、证据卡与边界

环境 Darwin arm64 + Go（父模块工具链）。不支持：TLS 握手成本、H2 多路复用（单连接多流，不适用本计数）、公网 NAT 超时。

> 分工声明：本篇管服务端生命周期（复用/禁用/空闲超时）；客户端连接池调优（默认每宿主 2 条空闲、H2 流级复用）见 [http.Transport 的复用账本](/writing/go-nethttp-connection-reuse)。

## 参考资料

- Go 文档：http.Transport、Server.IdleTimeout，<https://pkg.go.dev/net/http>（2026-09-14 核对）
