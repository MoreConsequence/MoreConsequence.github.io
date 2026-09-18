---
title: "HTTP 四则：复用、流、续传、跨域"
description: "keep-alive 复用与空闲超时、分块流式首字节、Range 断点续接、CORS 预检三件套，一次对照四个常用语义。每则独立断言，同一主题：语义全在头里。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-18"
tags: ["网络", "HTTP", "协议", "Go"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** HTTP 四个常用语义一次对照：keep-alive 默认复用、禁用即每请求建连、服务端空闲超时即重拨；`Flush` 分块首字节数量级快于攒完再写；`Range` 206 加精确 `Content-Range` 并可断点续接；CORS 预检三件套且凭据回显具体源。四组断言全过，细节数字见各则原始输出引用。

## 一、复用：连接是池不是线

默认 Transport 复用，`DisableKeepAlives` 每请求建连，服务端 `IdleTimeout` 到即重拨（`experiments/http-keepalive/`）：

```text
复用：10 请求只建 1 连接 / 禁用：10 请求建 10 连接 / 空闲 300ms 后重拨：共 2 连接
```

客户端池调优（每宿主 2 条空闲、H2 流级）见 [复用账本](/writing/go-nethttp-connection-reuse)。

## 二、流：首字节是 contracts

边算边吐必须显式 `Flush`；`Fprint` 写完就返默认是缓冲语义，首字节延迟 = 全量耗时（`experiments/http-chunked/`，本机对照见下）：

```text
chunked TTFB=1.65ms（总量 300ms+）/ buffered TTFB=302.900625ms（等价总量）
```

加固：`If-Modified-Since` 未过期回 304 空身、过期回 200 全文——条件请求是缓存生效的另一半。

## 三、续传：续接是客户端状态机

206 + 精确 Content-Range + ETag 校验 + 已收字节持久化，缺一端都是重下（`experiments/http-range/`）：

```text
Content-Range="bytes 0-99/1024000"（payload 是 1024000 不是 1048576——纠正过我一次）
续接完整：524288 + 499712 = 1024000
```

加固：`If-Range` 对不上回全文 200——内容变了还续接就是拼坏文件。

## 四、跨域：预检三件套

合法源 204（方法+头+600s 缓存），非法源 403 无头，凭据回显具体源（`experiments/cors-preflight/`）：

```text
C1 合法预检 204 / C3 凭据回显具体源 / C5 Vary 防缓存投毒
```

加固 C5：`Vary: Origin` 必带——否则 CDN 把 A 源的 allow-origin 缓存喂给 B 源，跨域隔离全破。

## 五、证据卡与边界

原始输出：`evidence/http-keepalive-reuse/`、`evidence/http-chunked-flush/`、`evidence/http-range/`、`evidence/cors-preflight/`（2026-09-13/14-local）。不支持：TLS/H2、公网 NAT、代理缓冲、浏览器差异。

## 参考资料

- RFC 9110（Range）、Fetch CORS 协议、Go Transport 文档（2026-09-14 核对）
