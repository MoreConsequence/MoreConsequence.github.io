---
title: "Nagle 算法与延迟 ACK：两个省网络包的内核定时器，如何把 12 字节的包拖成 119 毫秒"
description: "Nagle 攒小包等 ACK，延迟 ACK 攒 ACK 等数据，两个'省包'的定时器在 RTT 时不期而遇：实测跨容器 netem 100ms RTT，连续 10 个 12B 小包，Nagle 开启时后 9 个包被摁住合成一段，第二批到达延迟 118.6ms；NODELAY 下 10 包 1.5ms 内全部到达。并顺便戳破一个反直觉发现：Go 的 net 包默认就是 TCP_NODELAY。"
publishedAt: "2026-08-15"
updatedAt: "2026-08-15"
tags: ["网络", "TCP", "Linux"]
draft: false
featured: false
series: "网络协议"
---

**TL;DR：** Nagle（发送端攒小包）与延迟 ACK（接收端攒 ACK）各拿一个定时器，都为了少发网络包。**单看各自都正确，合起来是事故**：Nagle 摁住小包等 ACK，延迟 ACK 摁住 ACK 等数据——在 RTT 不可忽略的网络里，这是一场互相等待的踩踏。实测（本机跨容器 + netem 模拟 100ms RTT）：连续 10 个 12B 小包，Nagle 开启时后 9 个被合并在一个 TCP 段里，第二批到达服务端延迟 **118.6ms**（约 1 RTT + 40ms 延迟 ACK 定时器）；`TCP_NODELAY` 下 10 个包 **1.5ms** 内全部到达，快约 79 倍。修法一句话：小包交互场景开 `TCP_NODELAY`。另一个反直觉事实：**Go 的 `net` 包默认就开着 `TCP_NODELAY`**，所以很多 Go 服务其实从未踩过 Nagle，而 Java/C 客户端常踩。

## 一、两个定时器的各自逻辑：为什么要"省包"

TCP 是字节流协议，没有"消息"概念。应用写 12 字节，内核何时把它发出去，不全由应用决定——有两个内核策略在管：

**Nagle 算法（发送端）**，1984 年 RFC 896：
- 条件：连接中有**未确认**数据，且新数据小于一个 MSS（最大段大小）
- 行为：先把小数据**摁在发送队列**，等前一段数据被 ACK（或超时）再一起发
- 动机：避免"满窗口里塞小段"——尤其交互式应用（telnet 时代打一个字符发一个包），1 字节数据 + 40 字节头，包效率极低

**延迟 ACK（接收端）**，RFC 1122：
- 条件：接收方收到数据段，但暂无数据要发（ACK 无法捎带）
- 行为：不立即回 ACK，**最多等 40ms**（Linux 默认，`tcp_delack_timer`），期间若对方数据来了或自己有数据要发，就合成一个
- 动机：ACK 是纯开销（无载荷），40ms 内到第二次交互的概率不低，少回一个纯 ACK 就能省一个包

两个策略的代价都是"延迟"，收益都是"少包"。在本地回环（RTT ≈ 0）上，两者几乎无感；一旦 RTT 变大，就成了互相亏欠。

## 二、踩踏现场：谁在等谁

经典死锁（Linux 内核注释里叫 "delayed ACK debacle"）：

```
客户端（Nagle 开）                    服务端（延迟 ACK 开）
      |---- 发包1（12B，未确认） ------->|
      |                             收到，无数据可回
      |   Nagle：包2 摁住，等 ACK      延迟 ACK：等 40ms 再回
      |<--- ACK（40ms 定时器到期） ----|
      |   ACK 到达，包2 放行           并捎带把包2-10 一起发
      |---- 发包2..10（合并一段） ------>|
```

关键点：**Nagle 摁住的是"后发的小包"，延迟 ACK 摁住的是"先收的 ACK"**。双方都在等对方先动。整个循环打一个转就得耗掉"一个完整 RTT + 40ms 延迟 ACK 定时器"。这个间隔不随批大小变化——所以批越大、单包越碎，Nagle 的税越显眼。

有一个重要前提：**服务端必须真的"无数据可发"**。只要服务端在 40ms 内回了业务数据，ACK 就被数据捎带出去了（TCP 的 ACK 可以搭在数据上，不需要独立包），Nagle 的摁包马上被解除——这是"很多 Nagle 罪状其实是别的锅"的原因：查问题先确认服务端是否延迟回包。

## 三、实测：100ms RTT 下差 79 倍

要复现这个交互，本机回环不够——macOS/lo 上延迟 ACK 基本失灵（内核在 lo 上不改延迟 ACK），RTT ≈ 0 时 40ms 定时器也不会真踩。用 Docker 起了两个 Linux 容器，`tc netem` 给两侧网卡各加 50ms 延迟，模拟真实跨机房 RTT ≈ 100ms：

```bash
# 容器 nagle-cli（客户端）与 nagle-srv（服务端），均加单程 50ms 延迟
tc qdisc add dev eth0 root netem delay 50ms 5ms
```

服务端：**只读不回**（正是"无数据可回、延迟 ACK 定时器启动"的现场）。
客户端：连发 10 个 12 字节小包，两组对照——Go 的 `conn.(*net.TCPConn).SetNoDelay(false)` 显式开 Nagle vs 默认 NODELAY。服务端 tcpdump 抓到达时序：

```
Nagle 开启：
  1786774551.050387  包1 到达（seq 1:13, 12B）
  1786774551.110905  ← ACK 到达客户端（40ms 延迟 ACK 定时器到期才回）
  1786774551.168961  包2-10 合并一段到达（seq 13:121, 108B）
  第二批延迟 = 168.961 - 50.387 = 118.6ms

TCP_NODELAY：
  1786774569.175458 ~ 1786774569.176951  10 个独立段，1.5ms 内全部到达
```

| 配置 | 10×12B 全部到达耗时 | 相对延迟 |
| --- | --- | --- |
| Nagle 开启（SetNoDelay(false)） | 118.6ms | ≈ 1 RTT + 40ms |
| TCP_NODELAY（Go 默认） | 1.5ms | 快约 79 倍 |

另一个反直觉的结果：**Nagle 开启时总延迟里，网络 RTT 只是配角**（100ms RTT 只占 118.6ms 的一部分），主角是"40ms 延迟 ACK 定时器 + 排队"。还有：Nagle 批处理让服务端只在 2 个 TCP 段里看到 10 个包（另一个"省包"），这解释了上一节说的"单看每个策略都省包"。

## 四、修复的层次，从应用到内核

1. **应用层最干脆：`TCP_NODELAY`**，小包交互型负载（请求-响应、聊天、IoT 遥测）直接开。代价是每个独立 write 就是一个包——请同时注意"应用层小 write 风暴"问题，批量写数据应攒成一个 write。
2. **服务端主动破除延迟 ACK：`TCP_QUICKACK`**（Linux）——让服务端不等 40ms，立即回 ACK。代价：纯 ACK 变多，但如果是半交互协议（客户端连续写、服务端写回），收益显着。
3. **协议层设计**：交互频率低、单荷载小的场景（游戏、华尔街行情），用 UDP/QUIC 自管可靠传输，彻底绕开这对定时器。
4. **实在解不了时**：把 Nagle 摁包上限调低或自实现喷发（`TCP_CORK` 手动攒批，明确"攒多少算一批"），比靠内核猜省心。

层级的取舍一句话：**NODELAY 让包变多但延迟可控；Nagle 让包变少但延迟看内核脸色**。交互式小包流量选前者，批量大包流选后者无所谓。

## 五、Go 默认 NODELAY：多数人从没踩过，少数人以为自己踩过

写 Go 的读者有福，但这也是本文实测中最先误导我的地方：

```go
// Go net 包：Dial 出来的 TCPConn 默认 NoDelay=true（即 NODELAY）
conn.(*net.TCPConn).SetNoDelay(false)  // 想要 Nagle 必须显式关
```

我的第一轮实验两组数据几乎一样（都在 5.2-5.3s），百思不得其解，回头看代码才发现：**Go 的 `net.Dial` 默认 `TCP_NODELAY`**。于是"Nagle 开启组"其实也开着 NODELAY。这不是 Go 独有的怪癖，很多现代框架（Node.js、Rust 的 tokio 默认也是）同样默认关闭 Nagle。

教训：**"默认"不一定是平台默认**。排查 Nagle 相关延迟时，先确认语言运行时是否暗改了 socket 选项（`lsof` 或 `ss -o` 能看到 TCP_NODELAY 状态）。

## 结论：Nagle 与延迟 ACK 要按 RTT 和交互粒度共同选择

Nagle + 延迟 ACK 是一对"各自合理、合起来翻车"的定时器组合，只要服务端在 RTT 周期内无数据可回，小包批发送就会被打进 118ms 级的延迟（实测 100ms RTT 下 118.6ms）。修法按需取：小包交互开 `TCP_NODELAY`；服务端快速回 ACK 用 `TCP_QUICKACK`；逃避定时器选 UDP/QUIC。本机复现需要跨容器 + netem 而不是回环——因为回环上延迟 ACK 被跳过。下一步可做的事：如果服务端是不可控的黑盒（第三方 API），可以实测其"回包延迟分布"判断它是否扼杀了 Nagle 的省包收益。

复现方法（本次实验）：两个 Docker 容器（`golang:1.25-alpine` + `iproute2`），客户端与服务端各加 `tc netem delay 50ms 5ms`，跑上面的 client 程序（支持 `nagle` 参数显式 `SetNoDelay(false)`），服务端 tcpdump 抓到达时序。

## 六、参考资料：定时器语义与实现开关

- [RFC 1122：Requirements for Internet Hosts](https://www.rfc-editor.org/rfc/rfc1122)：Delayed ACK 的等待上限与 TCP 主机要求。
- [RFC 896：Congestion Control in IP/TCP Internetworks](https://www.rfc-editor.org/rfc/rfc896)：Nagle 算法要解决的小报文拥塞问题。
- [Go `net.TCPConn.SetNoDelay`](https://pkg.go.dev/net#TCPConn.SetNoDelay)：Go `TCPConn` 的 NODELAY 配置及默认行为说明。
- [Linux `tcp(7)`](https://man7.org/linux/man-pages/man7/tcp.7.html)：`TCP_NODELAY`、`TCP_QUICKACK` 等 socket 选项。
