---
title: "chunked 流式 vs 缓冲：首字节 1ms 对 300ms"
description: "同一 300ms+ 响应体：Flush 分 3 块推送首字节 1.1ms 到达，缓冲写完再发首字节 302ms 到达。用 ConnState 级计时锁定，并说明 SSE/LLM 流式输出为何必须 chunked。"
publishedAt: "2026-09-14"
tags: ["网络", "HTTP", "流式", "Go"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 同样总量 300ms+ 的响应：`Flusher.Flush()` 分块推送首字节 1.1ms 到达，攒完再写首字节 302ms 到达——差 270 倍。2 测试全过。结论：任何“边算边吐”的场景（SSE、LLM token 流、进度）必须显式 Flush；`fmt.Fprint` 写完就返的 handler 默认是缓冲语义，首字节延迟 = 全量耗时。

## 一、合同

| 写法 | 首字节 | 适用 | 代价 |
| --- | --- | --- | --- |
| Flush 分块 | ~1ms | 流式、进度、token 流 | 小包多、压缩率低 |
| 攒完再写 | ≈总量 | 静态内容、JSON API | 首字节 = 全量 |

## 二、实测

`experiments/http-chunked/chunked_test.go`，`evidence/http-chunked-flush/2026-09-14-local/run.out`，2 PASS（1.15ms vs 301.7ms）。

## 三、证据卡与边界

环境 Go + 本地回环。不支持：公网 TTFB、代理缓冲（nginx 默认会攒）、H2/H3 流。

## 参考资料

- Go 文档：http.Flusher，<https://pkg.go.dev/net/http#Flusher>（2026-09-14 核对）
- 前篇：SSE 续传（流式语义），`/writing/llm-14-sse-resume-push`
