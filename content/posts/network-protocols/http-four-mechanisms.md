---
title: "HTTP 四则：复用、流、续传、跨域"
description: "keep-alive 连接池复用、chunked 流式首字节延迟、Range 断点续接校验与 CORS 预检三件套。从协议报文到 Go 与 Node 实测源码，一次讲透四个最易出错的 HTTP 核心机制。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-18"
tags: ["网络", "HTTP", "协议", "Go", "Web安全"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 许多开发者习惯将 HTTP 视为简单的请求响应式文本协议，忽视了底层传输层与头部契约的精密协同。本文基于仓库内可复现的自动化测试套件（Go 标准库与 Node.js 原生 HTTP），深度拆解四个高频核心机制：**连接复用**（`keep-alive` 维持长连接池化与服务端 `IdleTimeout` 关闭行为）、**分块流式**（`Transfer-Encoding: chunked` 与 `http.Flusher` 将 TTFB 从 302ms 骤降至 1.65ms）、**断点续传**（`Range`、`206 Partial Content` 与 `If-Range` 防拼接损坏校验）以及 **CORS 预检**（`OPTIONS 204` 缓存、凭据校验禁止通配符与 `Vary: Origin` 防 CDN 缓存投毒）。

## 一、连接复用：连接是池而不是线

HTTP/1.1 默认启用持久连接（Persistent Connection / Keep-Alive）。但在高并发微服务调用中，若调用端忽略连接池生命周期管理，系统将退化为高频握手或连接泄漏。

```text
HTTP Keep-Alive 默认复用 vs 禁用复用拓扑：
[客户端 10 次请求] ----------------+
                                   |
         +-------------------------+-------------------------+
         | (默认复用 Transport)                              | (禁用复用 DisableKeepAlives)
         v                                                   v
+------------------+                               +------------------+
| TCP 握手 (SYN)   | (仅第 1 次建连)                | 每次循环重复:    |
| 请求 1 -> 响应 1 |                               | 1. TCP 三次握手  |
| 请求 2 -> 响应 2 | (复用既有 TCP 连接)           | 2. 请求 -> 响应  |
| ...              |                               | 3. TCP 四次挥手  |
| 请求 10-> 响应 10|                               |                  |
+------------------+                               +------------------+
| 总连接数: 1      |                               | 总连接数: 10     |
+------------------+                               +------------------+
```

### 1. 真实行为实测与 Go 客户端陷阱

在 `experiments/http-keepalive/keepalive_test.go` 中，我们通过 `httptest.Server` 的 `ConnState` 挂载原子计数器，验证连接建立频次：

```go
// 默认 Transport 复用验证：连续 10 次串行请求仅建 1 条 TCP 连接
func TestKeepAliveReuse(t *testing.T) {
	var conns atomic.Int32
	srv := newCountedServer(0, &conns)
	defer srv.Close()

	doN(t, srv.Client(), srv.URL, 10)
	if got := conns.Load(); got != 1 {
		t.Fatalf("复用下新建连接=%d，期望 1", got)
	}
	t.Logf("复用：10 请求只建 %d 连接", conns.Load())
}
```

两个致命的生产陷阱：

1. **响应体未完全读尽或未关闭**：若客户端仅调用 `resp.Body.Close()` 但未读取剩余内容（未执行 `io.Copy(io.Discard, resp.Body)`），Go 的 `net/http` 无法保证当前 TCP 连接处于干净的数据边界，只能强制销毁底层连接（`Close`）而非归还空闲池（`putIdleConn`）。
2. **服务端 IdleTimeout 导致的 EOF**：若服务端的空闲超时设置为 300ms，客户端若在空闲 350ms 后发起请求，旧连接恰好在服务端被发送 `FIN` 包关闭。如果客户端未开启重试或未正确处理空闲连接探测，将遇到经典的 `read: connection reset by peer` 或 `EOF`。

## 二、流式传输：首字节延迟是核心体验契约

在处理大文件导出、大语言模型 Token 生成或大型数据管道时，等待整个 Payload 渲染完成再输出会导致首字节时间（TTFB, Time to First Byte）严重劣化。

```text
缓冲式全量输出 vs 分块流式 (Chunked) 实时输出对比：
时间轴 (ms)   0ms           100ms         200ms         300ms
            |-------------|-------------|-------------|
Buffered:   [............ 服务端计算耗时 300ms ............][发送全量 200 OK + Payload]
            TTFB = 302.9ms

Chunked:    [发送头部][chunk-0][Flush] (TTFB = 1.65ms)
                      |--------> [chunk-1][Flush]
                                 |--------> [chunk-2][Flush]
```

### 1. 显式 Flusher 与性能实测对照

在 `experiments/http-chunked/chunked_test.go` 中，服务端模拟三段各 100ms 的耗时计算：

```go
// 流式分块传输：显式 Flush 立即释放头部与前序 Chunk
func chunkedHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Transfer-Encoding", "chunked")
	for i := 0; i < 3; i++ {
		fmt.Fprintf(w, "chunk-%d;", i)
		flusher.Flush() // 强制将内核缓冲区刷入网络套接字
		time.Sleep(100 * time.Millisecond)
	}
}
```

实测输出表明（`evidence/http-chunked-flush/`）：
- **Chunked + Flusher**：客户端首字节在 **1.65ms** 即可读取，总耗时 300ms+。
- **全量 Buffered**：客户端首字节被阻塞至 **302.90ms**。首字节延迟相差两个数量级。

## 三、断点续传：精确范围校验与条件请求保护

大文件下载与音视频点播依赖 HTTP 的 Range 请求机制。完整的断点续传是一个涉及客户端与服务端的严谨状态机。

```text
断点续传两段式请求流与 If-Range 强校验：
第 1 次请求:
Client  ---> GET /video.mp4 (Range: bytes=0-524287)
Server  <--- 206 Partial Content (Content-Range: bytes 0-524287/1024000, ETag: "v1")
[网络瞬断，已持久化 524288 字节]

第 2 次续接:
Client  ---> GET /video.mp4 (Range: bytes=524288-, If-Range: "v1")
            +-------------------------------------------------------+
            | 服务端核验 ETag 是否匹配:                             |
            | 1. 匹配 (未变更) -> 206 Partial Content (Content-Range) |
            | 2. 不匹配 (文件已更新) -> 200 OK (全量重传，防拼接坏块) |
            +-------------------------------------------------------+
```

### 1. 核心头部契约

- **Range**：客户端声明需要的字节闭区间，格式为 `bytes=start-end` 或 `bytes=start-`。
- **206 Partial Content**：状态码必须为 206，不能返回 200。
- **Content-Range**：服务端必须回传精确格式 `bytes start-end/total`（例如 `bytes 0-99/1024000`）。
- **If-Range 保护锁**：断点续接必须附带 `If-Range: <ETag>`。若资源在续接间隙被重新部署覆盖，服务端若直接拼接新旧两半文件将导致文件校验损坏。`If-Range` 机制确保当内容变更时，服务端主动降级为 `200 OK` 并返回全新的全量数据。

## 四、跨域安全：预检三件套与缓存投毒防护

跨域资源共享（CORS）绝不是简单的“设置 Access-Control-Allow-Origin 为 `*`”。错误配置会导致认证漏洞或 CDN 缓存穿透。

```text
复杂 CORS 预检交互与 CDN Vary 隔离防护：
Browser                   Origin Server / CDN
   |                               |
   |--- 1. OPTIONS /api/data ----->| (带 Origin: https://app.example)
   |    (Access-Control-Request-Method: POST)
   |    (Access-Control-Request-Headers: x-token)
   |                               |
   |<-- 2. 204 No Content ---------| (预检放行)
   |    Access-Control-Allow-Origin: https://app.example
   |    Access-Control-Allow-Methods: GET, POST
   |    Access-Control-Allow-Headers: content-type, x-token
   |    Access-Control-Max-Age: 600
   |    Vary: Origin  <------------| [关键安全头] 告诉中间 CDN 按 Origin 隔离缓存
   |                               |
   |--- 3. POST /api/data -------->| (携带 Cookie / Authorization)
   |<-- 4. 200 OK -----------------|
   |    Access-Control-Allow-Origin: https://app.example (严格回显，绝不可用 *)
   |    Access-Control-Allow-Credentials: true
```

### 1. 预检与凭据的三大铁律

1. **凭据请求禁止通配符**：当客户端启用 `credentials: 'include'`（携带 Cookie 或 HTTP 认证头）时，规范规定 `Access-Control-Allow-Origin` 必须显式回显具体的请求源（如 `https://app.example`），**绝不允许使用通配符 `*`**。浏览器检测到 `*` 且凭据开启时会直接抛出安全阻断。
2. **预检缓存减少 RTT 损耗**：复杂请求每次都发起 OPTIONS 会导致网络调用翻倍。通过回传 `Access-Control-Max-Age: 600`，允许浏览器将预检授权结果缓存 10 分钟。
3. **Vary: Origin 防范 CDN 缓存投毒**：如果反向代理或 CDN 缓存了 `Access-Control-Allow-Origin: https://app.example` 的响应但未标记 `Vary: Origin`，后续来自 `https://malicious.example` 的请求击中 CDN 缓存将直接拿到前者的授权响应，破坏源隔离边界。

## 五、经典错误与防御矩阵

| 场景 | 错误做法 | 严重后果 | 确定性解法 |
| --- | --- | --- | --- |
| 连接复用 | 仅执行 `resp.Body.Close()` | 连接未排空，无法进入空闲池，连接数持续上涨 | 读取剩余数据 `io.Copy(io.Discard, resp.Body)` 后再关闭 |
| 流式响应 | 仅在循环末尾调用写入 | 客户端首字节延迟等于整批数据生成总耗时 | 引入 `http.Flusher`，每次写入后显式调用 `Flush()` |
| 断点续传 | 盲目按字节拼接，未传 `If-Range` | 服务端资源被覆盖后拼出损坏文件，业务静默报错 | 强制附带 `If-Range: <ETag>`，失配时重置本地下载状态 |
| 跨域凭据 | 返回 `Allow-Origin: *` 与 `Credentials: true` | 浏览器直接报 CORS 协议错误，请求被前端直接拦截 | 校验请求头 `Origin` 是否在白名单，动态回显匹配源 |
| CDN 跨域缓存 | 动态回显源但未添加 `Vary: Origin` | CDN 缓存某一个 Origin 的跨域响应并投递给其他域名 | 凡根据请求头动态计算响应头的接口，必须添加对应 `Vary` |

## 六、证据卡与实测验证

| 验证项 | 运行环境与脚本路径 | 验证指标 | 结论 |
| --- | --- | --- | --- |
| 连接复用 | `experiments/http-keepalive/keepalive_test.go` | 10 请求新建连接数 | 复用下连接数=1，禁用下连接数=10 |
| 流式分块 | `experiments/http-chunked/chunked_test.go` | 首字节延迟 (TTFB) | Chunked 1.65ms，Buffered 302.90ms |
| 断点续传 | `experiments/http-range/range_test.go` | 续接字节一致性 | 524288 + 499712 = 1024000 逐字节校验吻合 |
| 跨域预检 | `experiments/cors-preflight/cors.mjs` | OPTIONS 状态码与凭据回显 | C1 合法 204、C3 凭据回显、C5 Vary 头校验均 PASS |

## 参考资料

- RFC 9110: HTTP Semantics (Keep-Alive, Range, Conditional Requests).
- RFC 9112: HTTP/1.1 (Chunked Transfer Coding).
- W3C Fetch Specification (Cross-Origin Resource Sharing).
- Go 标准库文档：`net/http` Transport 与 `http.ServeContent` 规范。
- 站内关联：[Go net/http 连接复用账本](/writing/go-nethttp-connection-reuse)
