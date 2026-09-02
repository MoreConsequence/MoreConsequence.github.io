---
title: "一次测速如何完成：Worker 合同、计量点与收尾算法"
description: "沿着 Web Worker 的 test_order、下行/上行计量点、grace time、time_auto、ping 和 jitter，解释 LibreSpeed Go 一次测速的完整协议边界。"
publishedAt: "2026-08-26"
updatedAt: "2026-08-31"
tags: ["Go", "测速", "源码阅读", "HTTP", "网络"]
draft: false
featured: false
series: "LibreSpeed Go 源码行纪"
---

**TL;DR：** 一次测速不是服务端返回一个“速度值”，而是 Worker 按 `test_order` 调度多轮 HTTP 操作，再把客户端观察到的字节和延迟算成结果。默认顺序是 `IP_D_U`，`P` 并不默认出现；下行统计浏览器收到的字节，上行统计浏览器交给网络栈的字节，服务端只提供随机载荷或接收汇。理解这条计量边界，才能正确解释多流、grace time、1.06 补偿系数和 jitter 加权，而不把它们误认为服务端性能证明。

## 一、先确定谁拥有流程控制权

Worker 收到 `start` 后，`runNextTest` 读取 `settings.test_order` 的下一个字符：

```js
test_order: "IP_D_U"
// I = getIP, P = ping/jitter, D = download, U = upload
// _ = pause
```

主线程只负责传入 settings 和展示进度；Worker 承担 HTTP 请求、计时和状态推进；Go 服务端提供端点并返回字节。`IP_D_U` 中没有 `P`，所以“页面显示 ping”不能反推默认配置一定执行了 ping 测试。

![LibreSpeed Worker 合同：start、端点交互与完成或中止状态](../../../public/images/librespeed-go-contract-worker-lifecycle-script.svg)

图中首尾状态也很重要：HTTP 200 只表示一次 HTTP 操作成功，Worker 的正常完成和中止分别由自己的状态推进决定。中止时需要清理请求并进入终态，不能用最后一个响应码代替整个测试的完成信号。

## 二、一次会话的阶段与计量点

| 阶段 | Worker 动作 | 服务端动作 | 主要计量 |
| --- | --- | --- | --- |
| I | `GET /getIP` | 返回来源/ISP/距离描述 | 连通性和身份准备 |
| D | 多条 `GET /garbage` | 写启动时生成的随机字节 | 浏览器收到的字节 |
| U | 多条 `POST /empty` | 读 body 到 `Discard` | 浏览器发出的字节 |
| P | 可选的 10 次小 `GET /empty` | 快速读空 body 并返回 | RTT、ping、jitter |
| T | `POST /results/telemetry` | 生成 ID 并写结果 | 结果提交，不重新计算速率 |

![一次测速从身份、下行、上行、延迟到结果读取的阶段时间线](../../../public/images/librespeed-go-speedtest-full-lifecycle-timeline.svg)

下行和上行的服务端动作看起来都很简单，差异在计量点：服务器没有看到浏览器的接收进度，浏览器也没有看到服务器真正读完 body 的时间。因此两边的“速度”天然不是同一个观测量。

## 三、下行：多流解决窗口天花板，grace 处理启动坡道

单条 TCP 流的吞吐可以用 `吞吐 ≈ 拥塞窗口 / RTT` 做近似直觉：在途字节受窗口限制，RTT 越大，单流越难填满高速链路。Worker 默认使用多条下载流，并以约 300ms 的间隔错峰启动；这会增加并行的在途字节预算，但不等于任何公网链路都能达到线速。

每条流的请求带随机 `r` 和 `ckSize`。前者避免缓存复用，后者让客户端表达期望的单次载荷；最终上限由服务端决定，超过 1024 chunks 时钳制为 1 GiB。单请求结束或连接出错后，Worker 根据 `xhr_ignoreErrors` 选择终止、重启该流或忽略错误。

慢启动期间如果立刻把字节计入分母，短测试会被启动坡道拉低。下行 grace time 到点且已经收到字节后，Worker 把 `startT` 重置为当前时间并清零 `totLoaded`；没有收到字节时不重置，避免慢链路永远无法进入正式窗口。

正式窗口每 200ms 更新一次：

```text
speed = totLoaded / elapsed_seconds
Mbps = speed × 8 × overheadCompensationFactor / 1,000,000
```

默认 `overheadCompensationFactor` 为 1.06，`×8` 是字节到比特，除数决定十进制 Mbps 或二进制 Mibps 的显示口径。`time_auto` 会根据当前速率累计提前收尾时间：它改变测试持续多久，不改变“从哪些字节计算”的基本公式。

## 四、上行：浏览器能数“发出”，不能确认“服务端收到”

上行载荷在浏览器侧生成：随机 `Uint32Array` 组成 Blob，默认约 20 MB，移动端会因内存约束降到更小的尺寸，再由多条流 POST 到 `/empty`。请求显式使用 `Content-Encoding: identity`，避免中间层把随机载荷当成可压缩内容处理。

核心计量事件是 `xhr.upload.onprogress`。它反映浏览器已经交给网络栈的字节数，不是服务端确认接收的字节数；丢包、重传和中间缓冲都不在这个事件里单独暴露。老浏览器没有可用的 upload progress 时，代码退化为更小的分片并按完成次数估算，源码也承认精度下降。

## 五、ping 取路径下限，jitter 对尖峰更敏感

可选的 `P` 阶段对 `/empty` 发 10 个小请求。Worker 优先使用 Performance API 的时间戳，异常的亚毫秒读数会被修正或沿用上次值；第一个样本主要用于校准。

![Worker 的 ping 最小值与非对称 jitter 加权公式](../../../public/images/librespeed-go-latency-jitter-filter-math.svg)

ping 取有效样本的最小值，而不是平均值：排队可以把 RTT 抬高，却不能让路径比物理传播更短。jitter 使用方向不对称的移动平均：尖峰到来时新样本权重 0.7，回落时新样本权重 0.2。

```js
jitter = instjitter > jitter
  ? jitter * 0.3 + instjitter * 0.7
  : jitter * 0.8 + instjitter * 0.2
```

这是一种“快速承认恶化、慢速忘掉恶化”的展示策略，不是网络协议层对抖动的唯一正确估计。

## 六、合同的边界

这套 Worker 合同可以回答：请求按什么顺序发生、哪些字节进入速率公式、为什么服务端同时需要 `garbage` 和 `empty`、以及一个结果 ID 如何被提交。它不能从 loopback 取证推出公网吞吐，也不能把客户端 upload progress 写成服务端接收速率；更不能因为多流和 `time_auto` 存在，就宣称所有设备都有相同的测量精度。

## 参考资料

- [librespeed/speedtest-go](https://github.com/librespeed/speedtest-go)，commit `59cff12`
- `web/assets/speedtest_worker.js`、`web/web.go`
- 本机取证：`evidence/librespeed-go-series/2026-08-26-local/evidence_run.log`
- 系列相关：[一个测速点的最小闭环](/writing/librespeed-go-01-overview)、[身份、隐私与存储](/writing/librespeed-go-03-client-ip)、[接口兼容与部署边界](/writing/librespeed-go-05-interface)
