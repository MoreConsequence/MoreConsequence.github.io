# evidence/latency-attribution/2026-08-23-local

三段归因实验原始输出：连接建立 / 服务端思考 / 响应传输。

## 环境

- darwin/arm64，Node v24.19.0，loopback (127.0.0.1)，零第三方依赖
- 工具：`experiments/latency-attribution/measure.mjs`

## 运行命令

```sh
node experiments/latency-attribution/measure.mjs
```

## 方法参数

- 每阶段 N=300 个**串行**请求（`maxSockets=1` 锁死排队干扰），每阶段独立 Agent 与预热请求
- 阶段间只改一个变量：B 改连接复用、C 改服务端 `think` 定时器(25ms)、D 改 body 大小(5MB)

## 原始输出

- `run.log`：A 基线 mean 0.386ms；归因差值——连接段 +0.190ms、思考段 +26.997ms、传输段 +3.439ms
- `run2-repeat.log`：重复一轮，三段差值 +0.142 / +26.531 / +3.946ms，方向与量级一致

## 边界

- loopback 无真实 RTT/TLS/丢包：连接段与传输段的绝对值**不可外推到公网**，
  可外推的是方法本身（差值归因）与思考段定时器的过冲方向；
- `setTimeout(25)` 的实测过冲（均值约 +1.5~2ms，p95 至 29.6ms）是 Node 定时器与本机负载的联合结果；
- 串行测量回答"单请求分解"，不回答并发下的排队与争用。
