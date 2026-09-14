---
title: "HTTP Range 断点续传：206 + Content-Range，524288 字节处续接"
description: "1MB 内容前 100 字节返回 206 与精确 Content-Range，断线后从 524288 续到尾部拼出完整 1024000 字节。用 ServeContent 双测锁定，并说明客户端续接责任。"
publishedAt: "2026-09-14"
tags: ["网络", "HTTP", "断点续传", "Go"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 1MB 内容：`Range: bytes=0-99` 返回 206 与 `Content-Range: bytes 0-99/1024000`，前 100 字节逐字节一致；断线后从 524288 续到尾，`524288 + 499712 = 1024000` 拼出完整体。2 测试全过。结论：续传是客户端状态机（已收多少→下次 Range 从哪起）+ 服务端 `ServeContent` 的组合，任何一端缺了都是“重新下载”。

## 一、合同

| 维度 | 服务端保证 | 不保证 | 客户端负责 |
| --- | --- | --- | --- |
| 分片 | 206 + 精确 Content-Range | 内容不变（变了续接即错） | ETag/Last-Modified 校验 |
| 续接 | 任意起点 | 断点记忆 | 已收字节数持久化 |
| 完整性 | — | 自动校验 | 拼完对哈希 |

## 二、实测

`experiments/http-range/range_test.go`，`evidence/http-range/2026-09-14-local/run.out`，2 PASS。另记：payload 是 `10×100×1024=1024000` 字节不是 1048576——断言写错过一次，Content-Range 亲自纠正了我。

## 三、证据卡与边界

环境 Go + 本地回环。不支持：多段 Range、If-Range、CDN 缓存交互。

## 参考资料

- RFC 9110：Range Requests，<https://www.rfc-editor.org/rfc/rfc9110#field.range>（2026-09-14 核对）
