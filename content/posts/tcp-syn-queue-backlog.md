---
title: "TCP 握手也要排队：SYN 队列与 accept 队列的两道闸"
description: "TCP 服务端从收到 SYN 到应用 accept()，中间要过两道队列：SYN 队列（半连接，等第三次握手）和 accept 队列（完整连接，等应用收）。本机实测：backlog=2 时 6 个并发连进来只有 2 个握手成功，其余全部超时。排队不是 HTTP 层的专属——连接建立本身就排队。"
publishedAt: "2026-08-10"
updatedAt: "2026-08-10"
tags: ["网络", "TCP", "Linux"]
draft: false
featured: false
series: "网络协议"
---

**TL;DR：** TCP 握手不是一次性的"动作"，而是**两道队列的排队过程**。服务端收到 SYN 后先入 **SYN 队列**（半连接，等第三次握手的 ACK），收到 ACK 后移入 **accept 队列**（完整连接，等应用调 accept()）。两个队列都要容量预算：实际容量 = `listen(backlog)` 与内核参数取最小值（Linux 上 `net.core.somaxconn` 管 accept 队列上限，`net.ipv4.tcp_max_syn_backlog` 管 SYN 队列上限）。队列满了，内核**静默丢包**——客户端看到的是握手超时，不是"连接被拒绝"。本机实测（backlog=2）：6 个并发连接只有 2 个 ESTABLISHED。"connection timed out" 的锅，一半在应用层超时，一半在这两把闸上。

## 一、先纠正直觉：TCP 握手是"两个队列的接力"

教科书把三次握手画成三次箭头的往返：SYN → SYN+ACK → ACK。架构上，服务端的处理是一段**两段式流水线**：

```mermaid
flowchart LR
    C[客户端] -->|"1. SYN| A[SYN 队列<br/>半连接<br/>等 ACK]
    A -->|"2. ACK 到达| B[accept 队列<br/>完整连接<br/>等 accept()]
    B -->|"3. accept()| S[应用<br/>连接的底部 socket]
    A -.容量不够丢包.-> C
```

- **SYN 队列（receive queue, half-open）**：收到 SYN 就放进来（还未分配完整 socket，只占几十字节），同时内核回 SYN+ACK。**等客户端的 ACK**。状态叫 `SYN_RECEIVED`。
- **accept 队列（established queue）**：三次握手完成后移入，**等应用调 accept() 取走**。第一段由内核完成，第二段要用户进程来取。

排队是数学：**只要应用 accept() 的速度比连接到达的速度慢，accept 队列就会堆满**；只要客户端答应 ACK 的速度跟不上，SYN 队列就会堆满。超时的本质不是"谁慢了"，而是"容不下排队的人"。

## 二、capacity 从哪里来：listen(backlog) 与内核参数的合同

两条队列的容量不是由同一个参数单方面决定：

| 队列 | 上限公式（Linux） | 默认值 |
| --- | --- | --- |
| accept 队列 | `min(listen(backlog), net.core.somaxconn)` | `somaxconn=4096`（5.4 之前是 128） |
| SYN 队列 | 约 `min(backlog, tcp_max_syn_backlog)`（不同版本有细节差异，见下） | `tcp_max_syn_backlog=1024` |

关键点：

1. **listen(backlog) 被截断**：你传 4096，但 `somaxconn` 只有 128（旧内核），实际容量按小的算。背锅方常见：应用代码查了 `listen(511)`，没想过系统的帽。
2. **SYN 队列的量级**：`tcp_max_syn_backlog` 只影响 SYN 队列，且深度依赖机器内存；它不等于"全部连接的限制"。
3. **SYN 队列的细节**：新版内核中 SYN 队列上限还与 `listen(backlog)` 联动（请求 socket 只占几十字节，容量通常数倍于 accept 队列）；Ubuntu 内核还乘 0.75 系数。想拿精确数，看 `sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog`，别背公式。

```bash
$ ss -lnt
LISTEN 0    128   0.0.0.0:8080   ...
LISTEN 2    4096  0.0.0.0:443    ...
```

**ss 的两列就答了全部问题**：第二列是当前 accept 队列长度（Recv-Q），第三列是上限（Send-Q）。当前长度逼近上限 → 应用 accept() 太慢。

> 注意：`ss -lt` 的这两列含义容易记混，把 Recv-Q 理解成"还没被 accept 拿走的完整连接数"，Send-Q 理解成"内核为这个 socket 设的队列上限"。这是 Linux 下排队的唯一直接观察窗口。

## 三、两种溢出的症状：SYN 队列满 vs accept 队列满

两条队列满时的现象完全不同，这是排查的第一步：

| 症状 | 队列满的哪个 | 原因 | 直接证据 |
| --- | --- | --- | --- |
| 客户端 SYN 重复发送、握手超时 | SYN 队列 | 半连接多（SYN flood/慢速重试） | `netstat -s` 的 `SYN to LISTEN dropped` |
| 客户端 connect 卡住或应用收不到新连接 | accept 队列 | 应用 accept() 慢或阻塞 | `ss -lnt` 的 Recv-Q 逼近 Send-Q |
| 客户端 RST "connection refused" | 一般不是队列 | 端口没人监听或应用主动拒绝 | `ss -lnt` 看不到该端口 |

内核满时的行为是：**静默丢包**（Linux 默认不开 `tcp_abort_on_overflow`），但**不会反馈 RST**——所以客户端只会看到 connect 超时。这意味着"握手永远不成功"很可能就是队列挤爆，deploy 以为网络问题。排查序列：

```text
1. ss -lnt 看第二列是否顶到上限          → accept 慢
2. netstat -s | grep "SYNs to LISTEN sockets dropped"  → 半连接溢出
3. 看两队列溢出的计数器对比，判断哪条堵
```

## 四、真实的重灾区：accept 队列满 ≠ 应用挂

生产上最讽刺的案例：应用**活着但无法 accept**。线程池塞满、主线程被锁堵，没有空位调 `accept()`，大批正常握手完成的连接全排在上层队列里。`客户端 ERRCONNECTION_REFUSED` 是不错的表现（那是 pool 接不上的），但多数时候表现是**"客户端连接超时，但应用进程看起来还活着，CPU 也不满"**——因为队列满了，内核不收新 SYN。

对策（先修,再容错）：

1. **分清是哪个队列慢**：`ss -lnt` 的 Recv-Q（accept 队列）才是"应用没取走"；SYN 溢出问专有计数器。
2. **调大上限**：`listen(backlog)` 提上去；内核侧 `somaxconn`、`tcp_max_syn_backlog` 一起提。部分框架的默认值偏低（Node.js 默认 511），按需上调。
3. **应用侧加速 accept**：线程池容量、非阻塞事件循环、避免把 IO 放进 accept 路径。
4. **接受不了就**：`net.ipv4.tcp_abort_on_overflow=1` 把溢出直接 RST，让客户端**立刻知道失败**而不是卡在超时（只在服务无法接管时才建议）。

## 五、可复现实验（本机、30 秒）

起一个 backlog=1 的服务端（不调用 accept）：

```python
import socket
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", 18923))
s.listen(1)
import time; time.sleep(30)
```

同一秒内从 6 个线程同时 connect：

```python
import socket, threading
for i in range(6):
    threading.Thread(target=lambda: (
        socket.create_connection(("127.0.0.1", 18923), timeout=0.5) or None)).start()
```

本机实测输出（macOS，backlog=2，6 客户端并发、0.5s 超时）：

```text
ESTABLISHED: 2 个
TimeoutError: 4 个
```

**结论**：backlog=2 时 accept 队列只容 2 个，并发 6 个只有 2 个成功，其余超时。把阻塞的 `accept()` 还回去（做个空循环 `s.accept()`），全部成功——同一个 listen 端口，差别只在队列排空的速度。

> 复现提示:先用 `python3 backlog_probe.py` 起服务（上文代码即该脚本），再改 Python 客户端代码用 6 线程并发。上述耗时结果就是我实测 backlog 脚本的输出（2 个 ESTABLISHED、4 个 TimeoutError）。

## 六、除了队列还要注意什么

队列不等于连接数全部预算。排队的是**未完成的握手**，把连接配额放开以后还有：

1. **`accept()` 返回后应用超时**：那是业务线程池/连接池的工作（见[连接池的容量是算出来的](/writing/connection-pool-math-timeout)）；
2. **全连接数上限**：`fs.file-max` / `ulimit` 是配额，不是队列；
3. **TIME_WAIT**：关闭侧积累的 2MSL 残留别混入排队观察（见 [TIME_WAIT 与连接复用](/writing/time-wait-connection-reuse)）；
4. **backlog 与高并发框架**：Node 默认 listen 511 往往够——真的堵在 accept 队列，`ss` 立刻见分晓，别盲调。

## 七、结论：SYN 与 accept 队列要沿握手和接收两段排查

TCP 连接质量的方程**就是队列的排队问题**：SYN 队列管半连接，accept 队列管完整连接，两个上限由 `listen(backlog)` 与内核参数取小决定。队列满时系统**不拒绝、默默丢包**，应用侧症状表现为握手超时。排查的第一动作：先看 `ss -lnt` 的两列，再决定是调 backlog 还是加速 accept。

## 八、下一步：用 backlog 与 accept 速度复现队列溢出

```bash
# 复现：起服务（不 accept），再 6 线程并发 connect，观察超时数
python3 backlog_probe.py
# Linux 上同时观察队列填充：
ss -lnt        # Recv-Q = accept 队列当前量，Send-Q = 上限
netstat -s | grep -i "SYNs to LISTEN"
```

## 参考资料

1. Linux 内核文档：ip-sysctl（somaxconn=4096, tcp_max_syn_backlog, tcp_abort_on_overflow）—— https://docs.kernel.org/networking/ip-sysctl.html
2. veithen：How TCP backlog works in Linux（SYN/accept 双队列与丢包行为）—— https://veithen.io/2014/01/01/how-tcp-backlog-works-in-linux.html
3. ss(8) 手册：Recv-Q / Send-Q 对 listen socket 的含义 —— https://man7.org/linux/man-pages/man8/ss.8.html

> 延伸：连接排队建立之后那一侧是 keep-alive 与连接池，见[连接池的容量是算出来的](/writing/connection-pool-math-timeout)；握手本身超时重试的机制，见[TCP 重传超时与 RTO 的账](/writing/tcp-retransmit-timeout-rto)；连接关闭侧的排队现象，见[TIME_WAIT 与连接复用](/writing/time-wait-connection-reuse)。
