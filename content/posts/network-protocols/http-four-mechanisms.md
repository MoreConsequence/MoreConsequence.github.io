---
title: "HTTP 四则：复用、流、续传、跨域"
description: "10 请求 1 连接对禁用 10 连接、空闲超时重拨；Flush 首字节 1ms 对缓冲 302ms；Range 206 续接完整；预检 204 三件套且凭据回显具体源。四组断言全过，同一主题：HTTP 的语义全在头里。"
publishedAt: "2026-09-14"
tags: ["网络", "HTTP", "协议", "Go"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** HTTP 四个常用语义一次对照：keep-alive 默认复用 10 请求 1 连接、禁用 10 连接、服务端空闲超时即重拨；`Flush` 分块首字节 1.1ms 对攒完再写 302ms；`Range` 206 加精确 `Content-Range`，524288 处续接拼出完整体；CORS 预检 204 三件套，凭据必须回显具体源（`*`+凭据浏览器拒收）。四组断言全过（3+2+2+4）。

## 一、复用：连接是池不是线

默认 Transport 复用（10→1），`DisableKeepAlives`（10→10），服务端 `IdleTimeout` 到即重拨。客户端池调优（每宿主 2 条空闲、H2 流级）见 [复用账本](/writing/go-nethttp-connection-reuse)（`experiments/http-keepalive/`）。

## 二、流：首字节是 contracts

边算边吐必须显式 `Flush`；`Fprint` 写完就返默认是缓冲语义，首字节延迟 = 全量耗时（`experiments/http-chunked/`，1.15ms vs 301.7ms）。

## 三、续传：续接是客户端状态机

206 + 精确 Content-Range + ETag 校验 + 已收字节持久化，缺一端都是重下（`experiments/http-range/`，524288+499712=1024000；另记 payload 是 1024000 不是 1048576——Content-Range 纠正过我一次）。加固：`If-Range` 对不上回全文 200——内容变了还续接就是拼坏文件。

## 四、跨域：预检三件套

合法源 204（方法+头+600s 缓存），非法源 403 无头，凭据回显具体源（`experiments/cors-preflight/`，4→5 断言）。加固 C5：`Vary: Origin` 必带——否则 CDN 把 A 源的 allow-origin 缓存喂给 B 源，跨域隔离全破。

## 五、证据卡与边界

原始输出：`evidence/http-keepalive-reuse/`、`evidence/http-chunked-flush/`、`evidence/http-range/`、`evidence/cors-preflight/`（2026-09-13/14-local）。不支持：TLS/H2、公网 NAT、代理缓冲、浏览器差异。

## 参考资料

- RFC 9110（Range）、Fetch CORS 协议、Go Transport 文档（2026-09-14 核对）
