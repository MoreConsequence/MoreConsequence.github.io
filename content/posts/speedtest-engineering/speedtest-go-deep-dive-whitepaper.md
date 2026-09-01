---
title: "测速服务如何知道你的带宽：从端到端计量到 speedtest-go 实现"
description: "从有效吞吐、BDP、缓存与压缩、TCP 反压、时间窗口和样本统计出发，逐项映射到 librespeed/speedtest-go@59cff12 的 Worker、HTTP Handler、结果层和部署边界。"
publishedAt: "2026-08-27"
updatedAt: "2026-08-31"
tags: ["Go", "网络协议", "系统设计", "性能优化", "源码阅读"]
draft: false
featured: true
series: "网络测速与极限吞吐工程"
---

**TL;DR：** 测速结果不是某台服务器的带宽宣言，而是一个方向、一个计量点和一个时间窗口里的有效字节速率。下行通常统计客户端收到的字节，上行通常统计客户端已经交给网络栈的字节；两者都要面对访问链路、路径队列、拥塞窗口、服务端消费速度和浏览器事件语义。一个可信的测速服务要先定义这几个边界，再处理缓存/压缩、BDP、TCP 反压、启动坡道、时钟和采样。`librespeed/speedtest-go@59cff12` 是一个很适合学习的 HTTP/XHR 参考实现：它用 1 MiB 随机块循环提供下行，用 `io.Copy(ioutil.Discard, r.Body)` 吸收上行，Worker 默认按 `IP_D_U` 调度 6 条下行流和 3 条上行流，并可选提交遥测。它没有替你完成全局选点、容量接纳、服务端上行权威计量或生产容量证明。

## 一、先定义“测到了什么”：有效吞吐是路径窗口里的字节

“带宽”至少有三个容易混淆的含义：链路的名义容量、某一段的瞬时可用容量，以及应用在一段时间内真正观察到的有效吞吐（通常称为 goodput）。测速客户端最终能计算的只是第三种。

设下行测试窗口为 `[t₀, t₁]`，客户端在窗口内报告收到的有效字节为 `B_rx`，则：

$$
R_{down} = \frac{8 \times (B_{rx}(t_1)-B_{rx}(t_0))}{t_1-t_0}
$$

上行的计量点换到了发送侧。若客户端的上传事件报告已经发出的字节为 `B_tx`，则：

$$
R_{up} = \frac{8 \times (B_{tx}(t_1)-B_{tx}(t_0))}{t_1-t_0}
$$

这里的“有效”不是“所有经过网卡的比特”。它通常排除了协议头，也不自动等于服务端已经持久化或应用层已经处理的字节。方向更不能省略：下载是节点到客户端，上行是客户端到节点，路径上的瓶颈可能完全不同。

![测速值是路径窗口里的字节：上下行方向和客户端计量点不同](../../../public/images/speedtest-whitepaper-measurement-model.svg)

沿着整条路径，应用可观察到的速率受到多个上限共同约束：

$$
R \leq \min(C_{access}, C_{path}, C_{node}, C_{queue})
$$

`C_access` 是客户端接入能力，`C_path` 是中间网络和拥塞状态，`C_node` 是测速节点实际能提供或消费的能力，`C_queue` 表示缓冲与调度是否让数据持续流动。这个式子不是精确容量模型，却能阻止一个常见错误：看到服务器有 40 Gbit/s 网卡，就把客户端测到的 200 Mbit/s 解释成“服务器只剩 200 Mbit/s”。测速值是这一次路径、这一个时间窗里的观察，不是服务器的静态属性。

## 二、为什么一次普通文件下载经常测错

### 2.1 单流首先受 BDP 约束

带宽时延积（Bandwidth-Delay Product，BDP）是“为了保持链路忙碌，路径上需要同时存在多少在途数据”的量纲估计：

$$
BDP = C \times RTT
$$

例如 1 Gbit/s、40 ms RTT 的路径，BDP 约为 5 MB。这个 5 MB 不是文件大小，也不是服务端缓存大小，而是发送方需要在确认到来前维持的在途字节预算。如果单条连接的拥塞窗口还没有涨到这个量级，发送方就会在等待 ACK 的时间里出现空档。

![单流的上限来自在途窗口：多流增加预算，但总速率仍受路径瓶颈限制](../../../public/images/speedtest-whitepaper-bdp-window.svg)

多条连接的作用是同时拥有多份拥塞窗口，让总在途字节更容易覆盖 BDP。它不能绕过接入线路或中间链路的瓶颈，也不能保证多流一定更快：共享队列、无线重传、服务端 CPU 和浏览器调度都会改变结果。更准确的说法是“多流提高填满窗口的机会”，而不是“并发创造带宽”。

### 2.2 文件内容还可能被缓存或变换

如果每次请求都拿到同一份静态文件，中间缓存可能直接返回本地副本；如果内容高度重复，代理或硬件可能尝试压缩。此时客户端统计到的字节和物理链路上真正搬运的字节就不再是同一个量。

常见的防失真手段有三层：

| 风险 | 控制手段 | 仍然不能保证什么 |
| --- | --- | --- |
| 缓存命中 | 每次请求加入随机查询参数；响应使用 no-cache/no-store | 不能证明所有中间设备都遵守 HTTP 缓存语义 |
| 内容压缩 | 使用不可压缩的随机字节；必要时声明 `no-transform` | 随机性只降低风险，不能代替抓包或链路证据 |
| 本地 I/O 混入 | 客户端收到即计量或丢弃，不写磁盘 | 浏览器自身缓冲和事件调度仍会影响观测 |

随机内容也有成本。请求时调用 CSPRNG 会把 CPU 工作放入热路径；预先生成只读块则把成本移到启动期，但会占用常驻内存。工程取舍不是“随机池越大越专业”，而是找到足以避免重复变换、又不会让内存预算失控的块大小。

## 三、下行路径：服务端提供字节，客户端决定怎样计量

在 `speedtest-go@59cff12` 中，下行数据由 `web/web.go` 的包级变量在启动时生成：

```go
const chunkSize = 1048576 // 1 MiB

var randomData = getRandomData(chunkSize)
```

`getRandomData` 使用 `crypto/rand` 填充这 1 MiB，`garbage` Handler 在请求路径里重复写它。服务端默认写 4 个 chunk；`ckSize` 可以表达客户端想要的 chunk 数，但大于 1024 时被服务端钳制。因此本地取证得到：默认 4,194,304 字节，`ckSize=1` 得到 1,048,576 字节，`ckSize=99999` 得到 1,073,741,824 字节。

```go
chunks := 4
if ckSize := r.FormValue("ckSize"); ckSize != "" {
	i, err := strconv.ParseInt(ckSize, 10, 64)
	if err == nil {
		if i > 1024 {
			chunks = 1024
		} else {
			chunks = int(i)
		}
	}
}

for i := 0; i < chunks; i++ {
	if _, err := w.Write(randomData); err != nil {
		break
	}
}
```

这里有三个值得记住的边界：

1. `randomData` 是 1 MiB 的启动期随机块，不是 64 MiB 或 1 GiB 常驻池；大响应通过重复写块产生。
2. `ckSize` 是协商输入，不是客户端可以突破的资源命令；服务端上限决定一次请求最多写多少。
3. 客户端断开后 `Write` 返回错误，循环退出；“结束测试”需要和服务端停止继续写入同时发生。

`ListenAndServe` 使用 chi 的 `middleware.NoCache`，Handler 还设置二进制下载相关响应头；Worker 给每条下行请求附加随机 `r` 参数。它们共同降低缓存干扰，但不能把“设置了响应头”写成对所有代理行为的形式证明。

## 四、上行路径：TCP 反压如何从慢消费传回发送方

上行更容易被一句“服务端把数据丢掉了”掩盖。真实路径是：

```text
客户端发送
  → TCP 接收缓冲区
  → 服务端内核把字节交给 socket
  → Go Handler 读取 r.Body
  → ioutil.Discard
```

如果应用层读取及时，接收队列不会长期堆积，TCP 通告窗口保持可用，客户端可以继续发送。如果应用层读取很慢，接收队列会变满，通告窗口逐渐缩小，最终可能出现 zero window；发送方不是“网络突然没有带宽”，而是在等待接收方腾出空间。

![TCP 反压从 Recv-Q 传导到发送方：及时消费保持窗口，慢消费让 window 归零](../../../public/images/speedtest-whitepaper-backpressure.svg)

`speedtest-go` 的实际 Handler 很短：

```go
func empty(w http.ResponseWriter, r *http.Request) {
	_, err := io.Copy(ioutil.Discard, r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	_ = r.Body.Close()
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
}
```

它的关键承诺是“读取并丢弃”，不是“服务端给出上行速度”。当前代码没有在这个 Handler 里维护服务端接收字节计数，也没有应用层 `MaxBytesReader` 之类的显式 body 限制；公网部署时，连接数、请求体大小、持续时间和慢客户端回收都需要由前置层或后续工程补上。

客户端的 `xhr.upload.onprogress` 统计的是浏览器报告的上传进度，接近“已经交给网络栈的字节”，不是服务端已经读取完成的字节。没有 upload progress 事件的旧浏览器走 256 KiB 小块和完成次数估算，源码明确承认这条降级路径不精确。所以上行结果的严谨叫法应当是“客户端发送视角的有效吞吐”，不是服务端接收真值。

## 五、时间窗口和统计量：三个问题不能用一个 P90 解决

### 5.1 时间源先决定差分是否可信

速率依赖 `Δt`。墙上时钟可以被 NTP 校正、用户手动调整或系统恢复影响；如果直接拿两个日历时间相减，理论上可能得到异常的小值、回退甚至非正差分。持续时间测量应使用单调时间源。

浏览器里，`performance.now()` 提供相对页面生命周期的高分辨率时间；`Date.now()` 是墙上时间。需要特别区分设计建议和标本事实：当前 `speedtest_worker.js` 的下行、上行和大部分日志时间使用 `new Date().getTime()`，ping 会尝试从 Resource Timing 取 `responseStart - requestStart`，失败时再回退到 Date 差值。因此不能把“测速服务应该使用单调时间”改写成“这个 Worker 已经端到端使用单调时钟”。

### 5.2 grace time 处理启动坡道

TCP 连接建立后，拥塞窗口和缓冲尚未进入稳态。若从第一个字节开始除以总时间，短测试会把启动阶段的低速算进去。Worker 的实际做法是等待 grace time：下行默认 1.5 秒，上行默认 3 秒；到点且已经收到/发出字节后，把 `startT` 重置为当前时间并清零累计字节。

正式窗口每 200 ms 更新一次：

```js
const speed = totLoaded / (t / 1000.0);
const status = (speed * 8 * overheadCompensationFactor)
  / (useMebibits ? 1048576 : 1000000);
```

默认 `overheadCompensationFactor` 是 1.06。它是显示口径的补偿参数，不是一次抓包就能证明的真实链路开销；使用者应该把它和单位选择、采样窗口一起记录。`time_auto` 还会根据当前速率累计 `bonusT`，提前结束快连接的测试：

```js
const bonus = (5.0 * speed) / 100000;
bonusT += bonus > 400 ? 400 : bonus;
```

这改变的是测试持续时间，不是字节计量点。它也意味着两个配置不同的客户端，可能在不同的窗口长度上得到不同的结果。

### 5.3 统计量必须和问题匹配

平均值、最小值、中位数、P90 和滚动窗口最大值回答的不是同一个问题：

| 统计量 | 更适合回答 | 主要风险 |
| --- | --- | --- |
| 全窗口平均 | 整个测试期间实际搬运了多少字节 | 启动坡道和收尾停顿会被纳入分母 |
| 中位数 | 典型采样处于什么水平 | 可能掩盖短时峰值或持续退化 |
| 最小 RTT | 路径固有延迟的近似下限 | 对样本量、异常修正和排队状态敏感 |
| P90/其他分位数 | 分布尾部或高位稳态的位置 | 必须说明样本、排序、插值和有效窗口 |
| 滚动窗口最大 | 某段连续窗口能达到的峰值 | 容易把 burst 当成长期容量 |

当前 `speedtest-go` Worker 的下行/上行状态公式是累计字节除以经过时间，并没有把 P90 截尾滤波隐藏在实现里。P90 可以是另一个测速协议的设计选择，但不能因为它听起来专业，就把它归给当前源码。

仓库中的 `experiments/speedtest-arch/window.mjs` 用应用层模拟了“先爬坡、后稳态”的字节流，比较三种估计器。历史记录中的一次运行得到：全程平均 138.6 Mbps，丢弃起步段后为 191.9 Mbps，800 ms 滚动窗口取最大为 199.8 Mbps；本次复跑得到的点值不同，但方向一致。这个差异本身就是边界：脚本里的定时器和 loopback 消费足以让点值漂移，因此它只证明不同估计器对同一类爬坡曲线的响应，不构成真实 TCP 慢启动、丢包、重传、公网队列或商业测速精度的证明。

![时间源、grace 窗口、200ms 更新与统计量选择：它们是四个不同的工程决策](../../../public/images/speedtest-whitepaper-time-sampling.svg)

### 5.4 ping 和 jitter 是这份源码自己的口径

Worker 默认做 10 次 ping。除第一轮校准外，后续样本更新最小 ping；jitter 使用相邻样本差的非对称加权：

```js
jitter = instjitter > jitter
	? jitter * 0.3 + instjitter * 0.7
	: jitter * 0.8 + instjitter * 0.2;
```

尖峰给新样本 0.7 权重，回落只给 0.2 权重。第三个 pong 才给 jitter 一个初始值，之后进入加权更新。这是当前 Worker 的展示算法，不应写成 RFC 3550 的实现，也不应直接等同于音视频系统里的 jitter 定义。

## 六、协议选择：HTTP/XHR 的优势是浏览器可达性

测速协议不是只比较“帧头谁更小”。还要同时考虑浏览器能否发起、缓存是否可控、CORS 和代理是否可解释、流控由谁持有，以及部署者是否能观察失败。

| 方案 | 浏览器可达性 | 适合的测量问题 | 主要代价 | 当前标本 |
| --- | --- | --- | --- | --- |
| Raw TCP | 普通网页不能直接打开 | 传输层实验、非浏览器客户端 | 需要原生客户端和独立协议 | 未采用 |
| WebSocket | 浏览器可达 | 双向长连接、应用消息 | 帧、掩码、代理和关闭语义更复杂 | README 明确不依赖 |
| HTTP + XHR | 浏览器原生，兼容 PHP 路径 | 单向持续字节流和轻量探针 | Header、缓存、CORS、XHR 事件进入测量 | 采用 |
| HTTP/2 / HTTP/3 | 由浏览器和 TLS/连接协商 | 多路复用或新传输层对照 | 流控和连接共享改变实验条件 | 有监听配置，本文无外部实测 |

因此，HTTP/XHR 不是“协议开销绝对最低”的结论，而是把浏览器、代理和自托管部署纳入同一个可访问接口的工程选择。若要比较协议，必须固定方向、载荷、连接数、时间窗、TLS、浏览器和统计规则；只比较一个帧头数字没有意义。

## 七、把原则映射回 `speedtest-go@59cff12`

### 7.1 启动顺序是依赖图

实际 `main.go` 只有 27 行：

```go
func main() {
	flag.Parse()
	conf := config.Load(*optConfig)
	web.SetServerLocation(&conf)
	results.Initialize(&conf)
	database.SetDBInfo(&conf)
	log.Fatal(web.ListenAndServe(&conf))
}
```

![把测速原则映射回 speedtest-go：请求路径与 main.go 启动依赖分开表示](../../../public/images/speedtest-whitepaper-librespeed-map.svg)

它表达出一个重要的所有权边界：Go 入口负责装配配置、服务器坐标、结果渲染资源、数据库实现和 HTTP 监听；测速阶段的状态机在浏览器 Worker，不在 `main.go` 里。`time/tzdata` 和 `rootcerts` 通过空白导入进入单二进制，但“单二进制”不等于没有依赖，而是运行时不需要另起一个 Web 框架服务。

### 7.2 HTTP 层把兼容和测量放在同一个 Handler 面

`web.ListenAndServe` 注册了几组路由：

```text
/empty                 /backend/empty                 /empty.php
/garbage               /backend/garbage               /garbage.php
/getIP                 /backend/getIP                 /getIP.php
/results/telemetry     /backend/results/telemetry     /results/telemetry.php
/results/json          /backend/results/json          /results/json.php
/stats                 /backend/stats                 /stats.php
```

PHP 后缀不是新的业务实现，而是同一处理函数的兼容入口；`/backend/` 也不是一层自动代理。全局中间件负责 RealIP、HEAD、全局 CORS、NoCache 和 panic 恢复。这个设计减少了前端迁移成本，却不会自动提供可信客户端身份：`CF-Connecting-IPv6`、`Client-IP`、`X-Real-IP` 和 XFF 都必须根据前置代理的信任边界使用。

### 7.3 Worker 把一次测试变成可观察的协议

Worker 默认设置包含：

| 设置 | 默认值 | 解释 |
| --- | --- | --- |
| `test_order` | `IP_D_U` | 获取 IP、下行、上行；`P` 不默认出现 |
| `xhr_dlMultistream` | 6 | 下行流数；部分浏览器 quirk 会改为 3 或 5 |
| `xhr_ulMultistream` | 3 | 上行流数 |
| `xhr_multistreamDelay` | 300 ms | 流之间错峰启动 |
| `time_dlGraceTime` / `time_ulGraceTime` | 1.5 s / 3 s | 正式计量前的启动窗口 |
| `count_ping` | 10 | `P` 阶段的 ping 次数 |
| `telemetry_level` | 0 | 默认不提交遥测 |

![Worker 合同：默认 IP_D_U 路径、可选 P 阶段和实际 HTTP 消息](../../../public/images/speedtest-whitepaper-worker-sequence.svg)

`runNextTest` 逐字符读取 `test_order`，同一类型只执行一次；下载完成或出错后清理请求，按 `xhr_ignoreErrors` 决定失败、重启流或忽略。测试状态 `-1/0/1/2/3/4/5` 分别覆盖未开始、启动、下载、ping、上传、完成和中止等阶段。这里的状态是 Worker 的状态，不是服务端 HTTP 状态；一个 `200` 只能说明一次请求返回成功。

### 7.4 结果层保存观察，不重新发明速率

遥测请求提交 `dl`、`ul`、`ping`、`jitter`、`ispinfo`、`log` 和 `extra` 等字段。`results.Record` 的路径是：

```text
database_type == "none"
  → Telemetry is disabled
否则
  → 读取请求元数据和表单
  → 可选 RedactIP
  → 生成 ULID
  → database.DB.Insert
  → 返回 id <id>
```

`DataAccess` 只定义 `Insert`、`FetchByUUID` 和 `FetchLast100` 三个操作，具体实现由配置选择：PostgreSQL、MySQL、MSSQL、SQLite、Bolt、memory 或 none。ID 混淆使用持久化的 4 字节 salt 对 ULID 的前 4 字节做 XOR，再用 base64url 编码；源码注释明确说明它不是密码学安全方案，目标是降低顺手枚举，而不是代替认证令牌。

```go
type DataAccess interface {
	Insert(*schema.TelemetryData) error
	FetchByUUID(string) (*schema.TelemetryData, error)
	FetchLast100() ([]schema.TelemetryData, error)
}
```

接口很窄，是因为测速服务只需要写入、按 ID 读取和读取最近记录；它没有替部署者定义事务、复制、备份或故障切换语义。

## 八、这份参考实现没有替你完成什么

![源码事实、运行观察和生产证明要分开：本机 loopback 不能升级成公网容量结论](../../../public/images/speedtest-whitepaper-evidence-boundary.svg)

结合源码和 dated evidence，可以把结论分成三层：

| 层次 | 当前能说什么 | 不能据此说什么 |
| --- | --- | --- |
| 源码事实 | 有 chi 路由、随机下行块、Discard 上行汇、Worker 参数、结果后端和配置分支 | 不能说所有配置组合都已运行验证 |
| 本机观察 | Darwin/arm64、loopback、`database_type=memory` 下，字节数、状态码、回环分类和遥测 ID 可复现 | 不能外推公网吞吐、跨地域 RTT 或 Linux 行为 |
| 生产证明 | 当前材料没有完整的容量、并发、部署和故障数据 | 不能宣称 10Gbps、十万并发、HA、SLO 或“生产就绪” |

具体缺口包括：

- 没有全局节点选择、BGP/GeoDNS 调度或跨节点会话绑定；多节点能力主要由前端配置和 MPOT 路径承担。
- 没有在测量端点内做并发接纳、速率限制、总字节额度或慢客户端回收策略；`ckSize` 上限只是单次下行请求的一个保险丝。
- 上行的权威观测点仍在浏览器 `upload.onprogress`，服务端没有把实际读取字节写回结果。
- `memory` 后端适合测试，`none` 关闭遥测；持久化、备份、迁移、复制和跨实例会话不是这个小实现自动提供的。
- Linux socket activation、TLS/HTTP/2、proxy protocol 等路径在源码中存在，但当前本机证据没有覆盖它们。

这不是贬低参考实现。恰恰相反，边界清楚的小实现更适合教学：它让人看见“一个测速节点”与“一个全球测速平台”之间到底差了哪些控制面、数据面和证据。

## 九、把测速结果写成带条件的工程结论

一个可审计的测速结果至少要绑定四件事：

1. **方向**：下行还是上行，客户端和节点谁在发送；
2. **计量点**：收到、发出、服务端读取，还是应用层确认；
3. **时间窗**：是否包含启动坡道、grace、time_auto 和收尾；
4. **环境**：设备、浏览器、连接数、协议、节点位置和证据来源。

如果要从这个项目继续构建服务，最先补的不是“把数字做大”，而是把这些边界做成可观察合同：

- 给每次测试记录节点、方向、流数、时间窗、请求字节和结束原因；
- 在前置层限制连接、请求体、持续时间和空闲连接，并区分客户端取消与服务端拒绝；
- 将客户端观察值与服务端接收值分开命名，不能把两者塞进同一个 `upload` 字段；
- 对不同浏览器、TLS、HTTP 版本和代理路径使用同语义对照，不把 loopback benchmark 当作公网结论；
- 保留原始输出、公式和环境，让“这个数字为什么是这样”可以重新计算。

测速服务最后教给我们的不是一套万能参数，而是一种工程纪律：先明确被测对象和观察边界，再设计数据路径；先识别会改变字节或时间的中间层，再决定统计量；最后把源码事实、本机实验和生产承诺放在不同的证据格子里。这样一篇文章才不会只是“有个下载接口、一个上传接口”，而能解释一个速度数字究竟是怎样被制造、观察和限制的。

## 参考资料

- [librespeed/speedtest-go@59cff12](https://github.com/librespeed/speedtest-go/tree/59cff12d1b95b3f80acd8a42b0156aa4fde440de)
- [RFC 9293：Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293)
- [RFC 7323：TCP Extensions for High Performance](https://www.rfc-editor.org/rfc/rfc7323)
- [RFC 9111：HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111)
- `experiments/speedtest-arch/window.mjs`：应用层爬坡曲线的估计器对照实验
- `evidence/librespeed-go-series/2026-08-26-local/`：Darwin/arm64 loopback 运行取证
- [LibreSpeed Go 源码行纪：服务骨架与三个测量端点](/writing/librespeed-go-01-overview)
- [LibreSpeed Go 源码行纪：身份、隐私与存储](/writing/librespeed-go-03-client-ip)
- [LibreSpeed Go 源码行纪：Worker 合同、计量点与算法](/writing/librespeed-go-04-contract)
- [LibreSpeed Go 源码行纪：接口兼容与部署边界](/writing/librespeed-go-05-interface)
