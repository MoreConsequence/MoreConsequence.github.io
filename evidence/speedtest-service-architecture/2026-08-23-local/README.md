# evidence/speedtest-service-architecture/2026-08-23-local

测速客户端吞吐估计算法的本机对照实验。

## 环境

- darwin/arm64，Node v24.19.0（fetch/HTTP 内置），零第三方依赖，loopback
- 工具：`experiments/speedtest-arch/window.mjs`

## 运行命令

```sh
node experiments/speedtest-arch/window.mjs
```

## 方法

- 服务端按时间分段定额发送：前 1200ms 以 33.6Mbps 爬坡，之后 201.3Mbps 满速，共 3.6s；
- 客户端每 50ms 采样累计字节数，分别用三种估计器计算吞吐：
  1. 全程平均（总字节/总时长）；
  2. 抛弃前 1400ms 后平均；
  3. 800ms 滚动窗口取最大。

## 原始输出（run.log，run2-repeat.log 为重复运行）

| 估计器 | 结果(Mbps) | 相对满速误差 |
| --- | --- | --- |
| 全程平均(天真) | 138.6 | -31.1% |
| 抛弃前 1400ms | 191.9 | -4.7% |
| 800ms 滚动窗口取最大 | 199.8 | **-0.8%** |

## 边界

- loopback 无真实 TCP 慢启动/丢包：爬坡是应用层模拟，用于检验**估计算法**对同一段字节流的响应，
  不代表真实网络收敛过程；
- 服务端忽略 write() 背压（loopback 消费极快）；生产实现必须处理 drain；
- 定时器精度导致 ±1% 内抖动，两轮方向一致；
- 本实验只证明"窗口化统计对爬坡流形的稳健性"，不构成对任何商业测速服务数值精度的评价。
