---
title: "HTTP/2 的队头阻塞还在：帧调度与流控的排队账"
description: "HTTP/2 用 stream 多路复用消除了 HTTP/1.1 的应用层排队，却仍受 TCP 有序字节流的传输层 HOL 影响。本文拆开丢包交付、每流/连接流控、调度和拥塞控制，用固定参数模型说明 HTTP/3 只隔离同一个字节洞，不是让整条连接没有排队。"
publishedAt: "2026-08-10"
updatedAt: "2026-08-17"
tags: ["网络", "HTTP/2", "队头阻塞", "流控"]
draft: false
featured: false
series: "网络协议"
---

**TL;DR：** "HTTP/2 解决了队头阻塞"是个流行误读。准确说法是：HTTP/2 消灭了 **应用层 HOL**（帧可以交错），但 **TCP 传输层的 HOL 仍然存在**——同一个连接上所有逻辑流共用一条有序字节流，丢包造成序号洞时，洞后的流数据不能交付。HTTP/3/QUIC 可以让其他流绕过同一个包洞，但仍共享连接级拥塞控制和流控。65,535 字节同时存在于每流窗口和连接初始窗口，不能简单相加成“每个流都能立即得到一份连接带宽”。判断是否迁移要看 RTT、丢包、响应形状、连接复用和实现 telemetry，而不是只看并发数或一个丢包阈值。

## 一、直觉错在哪：把"多路复用"当成"无阻塞"

HTTP/2 把请求/响应拆成帧，按流（stream）交错放在一条 TCP 连接上。这确实解决了 HTTP/1.1 的问题：连接被大响应占住时，后到的请求只能排队（"应用层 HOL"）。但"一个流不挡另一个流"只在**应用层话语权内成立**：

```
TCP 连接 = 一个有序字节队列
  ├── stream 1 的 DATA 帧（大响应，慢速写）
  ├── stream 2 的 HEADERS 帧 ← 想快，但排在 stream 1 的字节后面
  └── stream 3 的 DATA 帧
```

TCP 对应用层暴露的永远是一段顺序字节流：接收方必须按序组装，一旦序号有洞（丢包），**洞后面的所有字节——不管属于哪个流——都要等重传填上**。这就是传输层 HOL。HTTP 层再"多路"，排队的还是同一根管子。

注意一个细节：这里有两层账。**调度账**（谁的帧先发）由 HTTP/2 框架在应用层写；**输送账**（哪个包先到达）由 TCP 重传引擎写。后者才是 HOL 的宿主。

## 二、两个 HOL 的会计科目：应用层（已解决）与传输层（未解决）

| 层 | 谁写的调度 | 阻塞条件 | HTTP/2 状态 | QUIC 状态 |
| --- | --- | --- | --- | --- |
| 应用层 | HTTP 实现 | 响应未写完挡住新请求 | **已解决**（stream 交错） | 已解决（同） |
| 传输层 | TCP/QUIC 的交付与重传 | TCP 丢包时字节流排洞；QUIC 允许其他流绕过洞 | **未解决**（RFC 9113 §1） | **同一包洞对其他流隔离**，但仍共享拥塞控制 |

传输层 HOL 的代价可以用一个**固定参数模型**看清：20 个流共享一条 TCP 连接，如果丢失的包位于 stream 1，TCP 必须先填上字节洞，模型把洞后 20 个流都标为等待一个 RTT；QUIC 则只把 stream 1 标为受影响。真实实现中受影响流数还取决于帧如何装包、调度顺序、拥塞窗口和接收端处理，不能把“20 × RTT”写成所有网络的测量结果。

## 三、流控窗口：65,535 字节的隐性排队税

RFC 9113 规定：每个新流和整个连接的接收窗口初值**都是 65,535 字节**。窗口用完了流就停，等 WINDOW_UPDATE。

这两个窗口是两个独立的上限：单个 stream 不能超过自己的 credit，整个 connection 的 DATA 总量也不能超过 connection credit。它们不是 20 份可直接相加的带宽预算。

这个数字的三个后果：

1. **大流被窗口饿死**：64KB 的一次普通响应就能打穿流窗口。等窗口恢复，排队从"字节流"转成"信用"，不等也得等。接收方何时回 WINDOW_UPDATE 全由实现决定（RFC 只约束语义，不约束策略）。
2. **连接级窗口共享**：65535 是整个连接里所有流共用的初始 credit（可调）。一个慢流会先耗尽自己的 stream window；只有当连接级窗口也没有及时更新，其他流才会一起受限。不能简单把“慢流吸干连接池”当作必然因果，必须观察 WINDOW_UPDATE、连接缓冲和应用读取速率。
3. **窗口更新不是拥塞控制**：WINDOW_UPDATE 只表达接收端愿意再收多少，TCP/QUIC congestion window 由网络反馈决定。调大 HTTP/2 窗口可以减少应用流控停顿，却不能消除丢包、拥塞或慢消费者。

> 细节：只有 DATA 帧吃窗口（RFC 9113 §5.2.1 第 5 条），HEADERS/SETTINGS 等控制帧不占用——所以"头部被挡"很少，真正被挡的是大块 body 数据。

## 四、什么时候 HOL 真的痛：三种现实

| 场景 | 需要观察的变量 | 症状 | 迁移问题 |
| --- | --- | --- | --- |
| 机房内/云内 RPC | RTT、重传率、连接复用 | 传输层 HOL 很少暴露 | 先看实现复杂度与连接收益 |
| 公网 API（移动/跨区域） | RTT 分布、丢包、响应大小、并发流数 | 单连接尾延迟可能被放大 | 用同一 trace 对照 h2/h3 |
| 大文件/视频流 | 流控窗口、读取速率、丢包 burst | 慢流和重传共同拖慢交付 | 先拆分资源/连接，再评估 h3 |

判断标准不是单一丢包率：HTTP/2 的 HOL 代价还取决于 RTT、丢包是否成 burst、丢失帧属于哪个流、连接中是否混合小响应和大响应，以及实现如何调度和更新窗口。QUIC 的价值是把同一个包洞对其他流的阻塞隔离开；它不保证 h3 在所有负载下都比 h2 快，也不替代拥塞控制和慢消费者治理（见[QUIC 连接迁移](/writing/quic-http3-connection-migration)）。

## 五、先用确定性模型验证“洞影响谁”

仓库内的最小模型固定 20 个流、stream 1 丢包、50ms RTT，以及每流/连接 65,535 字节初始窗口：

```bash
python3 experiments/http2-hol-model/sim.py \
  --streams 20 --lost-stream 1 --rtt-ms 50 \
  --stream-window 65535 --connection-window 65535
```

本机一次输出：

```text
h2 initial credit: each_stream=65535 connection_total=65535
h2 lost-packet result: affected_streams=20 recovery_wait_ms=50
h3 lost-packet result: affected_streams=1 recovery_wait_ms=50 affected_stream=1
```

这只是把“有序字节流 vs 独立流交付”的一个变量固定下来，不是 h2/h3 实现 benchmark。若要做真实网络对照，再在 Linux 服务器保存 `tc netem`、HTTP 实现、TLS、客户端 trace 和多轮 p50/p95/p99；当前 Darwin checkout 没有这组证据。

## 六、真实验证还要补哪些变量

- 记录同一请求 trace 在 h2/h3 下的连接数、RTT、重传、流控更新和响应完成时间；不要只比较总 wall-clock。
- 分开测试小响应、大响应、同一连接混合负载和多个连接；否则无法知道收益来自传输协议还是连接复用。
- 记录丢包是独立随机还是 burst；同样的平均丢包率会产生完全不同的 HOL 形状。
- 用浏览器 DevTools 的协议列、服务端 HTTP/2/3 telemetry 和网络层 trace 对齐“看到 h3”与“其他流确实绕过丢包”的命题。

## 七、结论：HTTP/2 消除了流级 HOL，却保留 TCP 级 HOL

HTTP/2 的队头阻塞账本分两栏：**应用层已清账**（流可以交错）、**TCP 层仍有字节序依赖**。65,535B 是每流和连接的初始流控上限，不是性能常数；窗口更新、拥塞控制和慢消费者还会叠加排队。HTTP/3 的改进是把同一个包洞对其他流隔离，不是让整条连接没有延迟。判断迁移价值要用同一 trace 对照，而不是套一个丢包阈值：

- 低丢包且连接复用收益明显：先保持 HTTP/2，测实际 p99 和实现成本。
- 丢包/RTT/burst 使混合流尾延迟明显：用同一 trace 评估 HTTP/3，不要默认回退到 HTTP/1.1。

| | 应用层 HOL | 传输层 HOL | 流控窗口 |
| --- | --- | --- | --- |
| HTTP/1.1 | ✗（无多路） | —（每请求一连接） | — |
| HTTP/2 | ✓ 解决 | ✗ 保留 | 65,535B/流+连接 |
| HTTP/3 | ✓ 解决 | ✓ 同一包洞隔离 | 每流 + 连接级流控，仍受拥塞控制 |

本篇模型 raw 与环境记录在 `evidence/http2-head-of-line-blocking/2026-08-17-local/`；它只证明受控模型中的受影响流数差异。

## 参考资料

1. RFC 9113 HTTP/2（§1 明确 TCP HOL 未解决；§5.2 流控窗口 65,535）—— https://www.rfc-editor.org/rfc/rfc9113
2. RFC 9110 HTTP Semantics（对比 http/1.1 HOL）—— https://www.rfc-editor.org/rfc/rfc9110
3. Cloudflare：HTTP/2 vs HTTP/3（HOL 场景与部署实测）—— https://www.cloudflare.com/learning/performance/http2-vs-http3/

> 延伸：QUIC 如何用独立连接流真正移除传输层 HOL（[QUIC 连接迁移](/writing/quic-http3-connection-migration)）；丢包重传有多贵（[TCP 重传×RTO 账](/writing/tcp-retransmit-timeout-rto)）；弱网节奏由拥塞控制决定（[BBR 与拥塞控制](/writing/tcp-congestion-control-bbr)）。
