---
title: "CORS 预检三件套：204 + 方法 + 头，凭据必须回显具体源"
description: "合法源预检 204 带方法/头/600s 缓存，非法源 403 且无 allow-origin，凭据请求回显具体源而非通配符。用 4 断言锁定，并解释通配符加凭据为何是陷阱。"
publishedAt: "2026-09-14"
tags: ["网络", "CORS", "安全", "HTTP"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** CORS 预检三件套：合法源 `OPTIONS` 回 204（`Allow-Methods` + `Allow-Headers` + `Max-Age: 600`），非法源 403 且不带 `allow-origin`，凭据请求回显具体源（`https://app.example`）而非 `*`。4 断言全过。陷阱：`Allow-Origin: *` 加 `Allow-Credentials: true` 浏览器直接拒收——通配符与凭据互斥，这是规范不是实现差异。

## 一、合同

| 场景 | 服务端回什么 | 浏览器做什么 |
| --- | --- | --- |
| 预检通过 | 204 + 三件套 | 缓存 600s 内免预检 |
| 预检拒绝 | 403 无 allow-origin | 直接拦，不发实际请求 |
| 凭据请求 | 回显具体源 + credentials 头 | `*` 则拒收 |
| 非简单请求 | 先预检 | GET/POST 表单类可免 |

## 二、实测

`experiments/cors-preflight/cors.mjs`，`evidence/cors-preflight/2026-09-14-local/run.out`，4 PASS。

## 三、证据卡与边界

环境 Node + 本地回环（无真实浏览器，断言的是响应头语义）。不支持：浏览器实现差异、代理改写头。

## 参考资料

- Fetch 规范：CORS 协议，<https://fetch.spec.whatwg.org/#http-cors-protocol>（2026-09-14 核对）
