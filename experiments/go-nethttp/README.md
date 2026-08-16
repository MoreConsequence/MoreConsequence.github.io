# Go http.Transport 连接池：默认 2 条空闲连接 vs 调大的实测

Executable source for the article `go-nethttp-connection-reuse`（「Go 的设计边界」series）。

测量的是同一个东西：**Transport 为新请求新建 TCP 连接（dial）的次数**——空闲池命中失败时，
这个 dial 就是每请求付出的「复用税」。客户端侧通过包装 `DialContext` 精确计数；服务端侧用
包裹的 `net.Listener` 计数实际 accept 的连接，两者应当一致（本机 50 并发场景下完全吻合）。

## Claims

1. **默认池（`MaxIdleConnsPerHost=2`）在 50 并发下 24% 的请求仍要新建连接**：15000 请求
   dial 约 3573~3586 次（复用率 ~76%）。调大到 `MaxIdleConnsPerHost=100` 后只 dial 49 次
   （复用率 99.7%）。但回环上吞吐/延迟几乎不变（dial 税被本机 ~0.1ms RTT 掩盖）——回环测不出
   这笔税，跨网 RTT 才会放大它。
2. **高并发下默认池会震荡**：200 并发、默认池下三次重复吞吐在 1.1k~16.2k req/s 之间剧烈波动，
   p99 到 1s 以上；同参数调大池稳定在 ~29k req/s。连接建立路径（SYN/accept 队列）被持续打满时，
   整个系统进入不稳定区。属本机一次观察，非稳定分界线。
3. **`MaxConnsPerHost` 是硬并发上限**：200 并发 + `MaxConnsPerHost=5`，吞吐被压在 826 req/s
   （≈ 5 连接 × 1/5ms），p50 延迟涨到 235ms（排队）。这正是 Little 定律那篇说的池容量上界。
4. **`IdleConnTimeout` 负责回收空闲连接**：`IdleConnTimeout=2s` 跑完再等 5s，服务端 `open` 归 0。

## Commands

```bash
cd experiments

# 终端 1：本地上游（HTTP/1.1，每请求固定 5ms 处理成本；18765 数据口 / 18766 统计口）
go run ./go-nethttp/cmd/server

# 终端 2：
# 默认池
go run ./go-nethttp/cmd/bench -workers 50 -requests 300
# 调大池
go run ./go-nethttp/cmd/bench -workers 50 -requests 300 -perhost 100 -maxidle 100
# 高并发（震荡 vs 稳定）
go run ./go-nethttp/cmd/bench -workers 200 -requests 100
go run ./go-nethttp/cmd/bench -workers 200 -requests 100 -perhost 250 -maxidle 250
# MaxConnsPerHost 硬上限
go run ./go-nethttp/cmd/bench -workers 200 -requests 100 -perhost 100 -maxidle 100 -maxconns 5
# IdleConnTimeout 回收：跑完等 5s 再 curl 统计口，open 应归 0
go run ./go-nethttp/cmd/bench -workers 50 -requests 100 -perhost 100 -maxidle 100 -idle-timeout 2s
curl -s http://127.0.0.1:18766/stats
```

## 环境与原始输出

- 机器：macOS 25.5.0, Apple silicon (arm64)
- 运行时：Go 1.25.1（`go version go1.25.1 darwin/arm64`）
- 上游：本地 `127.0.0.1:18765`，handler 固定 `time.Sleep(5ms)` 后返回 `ok`，keep-alive 开启
- 客户端：每 worker 顺序请求（每 worker 一次只持有一条连接）

### 50 并发 × 300 请求（15000 请求）

默认池（`perhost=2`，三次重复）：

```text
new TCP connections dialed: 3581  (reuse ratio = 76.13%)
server-side accepts during run: 3581
throughput: 7952 req/s   latency avg=6.20ms p50=5.77ms p99=14.99ms
--
dialed: 3573  (76.18%)   accepts: 3573   throughput: 7286 req/s  p99=20.61ms
dialed: 3586  (76.09%)   accepts: 3586   throughput: 7255 req/s  p99=24.25ms
```

调大池（`perhost=100, maxidle=100`，两次重复）：

```text
new TCP connections dialed: 49  (reuse ratio = 99.67%)
server-side accepts during run: 49
throughput: 7989 req/s   latency avg=6.25ms p50=5.97ms p99=18.14ms
--
dialed: 49  (99.67%)     accepts: 49       throughput: 7595 req/s  p99=25.95ms
```

### 200 并发 × 100 请求（20000 请求）

默认池（三次重复，剧烈震荡）：

```text
dialed:  9695 (51.52%)  throughput: 16223 req/s  p99=57.58ms   (首次)
dialed: 10978 (45.11%)  throughput:  2358 req/s  p99=1.073s    (重复1)
dialed: 11515 (42.42%)  throughput:  2265 req/s  p99=1.272s    (重复2)
dialed: 14911 (25.45%)  throughput:  1139 req/s  p99=917.6ms   (重复3)
```

调大池（`perhost=250, maxidle=250`）：

```text
dialed: 229 (98.86%)  throughput: 29320 req/s  p99=15.32ms
```

### MaxConnsPerHost=5（200 并发，其余调大）

```text
dialed: 4 (99.98%)  throughput: 826 req/s  latency avg=240.87ms p50=235.43ms p99=295.33ms
```

### IdleConnTimeout=2s 的回收

`go run ./go-nethttp/cmd/bench -workers 50 -requests 100 -perhost 100 -maxidle 100 -idle-timeout 2s`
跑完等 5s 后 `curl http://127.0.0.1:18766/stats` → `{"accepts":13658,"open":0}`：空闲连接已全部关闭。

## 说明

- 回环上 dial 税 ≈ 0.1ms 级，50 并发时吞吐几乎不变，这是**诚实的**：本实验的对比焦点是「新建
  连接次数」这一事实（3581 对 49），不是回环吞吐。跨真实网络的代价见正文按 RTT 推导的部分。
- 200 并发默认池的震荡正是正文要讲的机制：空闲槽位太少 → 每请求大量 dial → SYN/accept 队列
  持续被灌 → 连接建立路径成为瓶颈。震荡幅度大，只作现象引用，不作稳定分界线。
