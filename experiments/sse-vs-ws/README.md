# SSE vs WebSocket 实验

对照「SSE（HTTP 单向流）与 WebSocket（RFC 6455 双向帧）」，测两件事：

1. **每事件开销与吞吐**（`bench.mjs`）：同一台机器、尽速推送 10 万条 32B 事件，比较到达首事件耗时、事件/秒、每事件线上字节。
2. **断线重连语义**（`reconnect.mjs`）：服务端在第 20 条事件后掐断连接，比较 SSE 的 Last-Event-ID 自动续传与 WebSocket 的手动重连（带/不带 `resume` 应用消息）。

`ws-server.mjs` 是手写的最小 RFC 6455 实现（握手 + 帧编解码 + ping/pong + close，帧编解码在 `ws-frame.mjs`），目的是把 WS 的协议复杂度摊开：握手一次 RTT、客户端帧必须掩码、心跳要自己发、重连要自己写、续传游标要应用层传。它不是可上线实现，只是可运行的本地教学原型。

## 环境

- macOS（本机为 Apple Silicon，Darwin 25.5，Node v24.19.0）。无需任何 npm 依赖，纯 Node 内置模块。
- 直接运行 `.mjs`，Node >= 22 即可。

## 跑法

```bash
cd experiments/sse-vs-ws

# 1) 每事件开销与吞吐（脚本会自己拉起两个服务端并回收）
node bench.mjs

# 2) 断线重连语义（同上，自拉起服务端）
node reconnect.mjs

# 3) 单开服务端 + 用 curl 看 SSE 原始流（观察 text/event-stream 与分块传输）
node sse-server.mjs --port=8081 --events=20 --interval-ms=200
curl -N http://127.0.0.1:8081/
#   然后另开终端验证自动重连：上面再跑一次 sse-server，用 Node 写个带 Last-Event-ID 的请求即可
```

## 改参数

两个服务端都接受 `--events`、`--data-bytes`、`--interval-ms`（0=尽速）、`--drop-at`（第几条后掐断连接）。

```bash
node sse-server.mjs --port=8081 --events=1000 --interval-ms=5 --drop-at=300
node ws-server.mjs  --port=8082 --events=1000 --interval-ms=5 --drop-at=300 --ping-ms=2000
```

## 读结果

- 输出里的字节数是**线上实际字节**：SSE 是 `id:N` + `data:` + 空行的文本块，WS 是 `id:N|payload` 文本帧 + 帧头。
- 2026-08-16 在本机（macOS 26.5.1 arm64 / Node v24.19.0）的一轮输出见 `evidence/2026-08-16-local/output.txt`，其中：
  - 每事件线上字节：SSE 49.9B vs WS 42.9B（32B payload + id，100k 事件）。差异 ~7B/事件（约 16%），来自 SSE 的 `data:` 前缀与空行。payload 变大时相对差异缩小。
  - 事件/秒：SSE ~85 万 vs WS ~22 万。这是**两个 toy 客户端实现**在回环上的差距（WS 端逐帧 Buffer 编解码更重），不是协议吞吐承诺；换优化实现会变，别拿它当协议结论。
  - 「到达首事件」SSE 侧含 Node `http.get` 的连接建立开销，回环上不代表协议；WS 在真实网络里多一次升级握手 RTT（RFC 6455 §4）。
- `reconnect.mjs` 的「WebSocket(仅重连)」行：服务端从 1 重新推，前 19 条重复（received 69、重复 19，本机一轮）。若服务端不重推而是前进，则丢失 20 之后的事件——两种失败都说明续传必须由应用层自己兜。

## 结果解释的一句话

SSE 的赢面不在吞吐，而在：重连语义协议内置（Last-Event-ID + retry）、HTTP 中间层可缓存可代理、HTTP/2 下多路复用解绑每源约 6 连接限制。WS 的赢面是双向 + 二进制，代价是握手一次 RTT、心跳/重连/续传全部自己实现。
