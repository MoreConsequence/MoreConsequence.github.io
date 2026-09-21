---
title: "Node 多进程：fork 出来的内存不共享"
description: "child_process.fork 切出真进程：PID 不同、内存不共享、消息全走 IPC 序列化。实测：2 子进程分掉 6 个平方任务，6/6 回包正确且至少 2 个不同 PID 干活，模块级 marker 互不干扰。"
publishedAt: "2026-09-20"
tags: ["Node.js", "多进程", "IPC", "TypeScript"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** 单进程（事件循环）+ 线程（worker）之后，Node 并发的第三极是**进程**：`child_process.fork()` 切出带 IPC 通道的真进程，`cluster` 模块是它的封装（多 worker 同抢一个端口）。和线程的本质差：内存**不**共享——子进程改模块级变量，父进程看不见；所有通信走 IPC 序列化，大对象贵。实测（`experiments/node-cluster-ipc/demo.mjs`，3 断言全过）：2 子进程 PID 与父不同（59557,59558），6 个平方任务 6/6 回包正确（9,49,121,169,289,361），至少 2 个不同 worker PID 干活。

## 一、三极对照

| | 事件循环 | worker_threads | fork/cluster |
| --- | --- | --- | --- |
| 隔离单位 | 无（同堆） | 线程（堆隔离，可 SAB 共享） | 进程（全隔离） |
| 通信 | 直接调用 | postMessage / SAB | IPC 序列化 |
| 一崩 | 全崩 | 主线程可 `terminate` | 子进程崩不影响父 |
| 适用 | I/O 并发 | CPU 下放 | 崩溃隔离、多核利用、端口复用 |

Go 工程师的直觉映射：goroutine ≈ 事件循环回调；`go f()` 跨线程共享内存 ≈ worker + SAB；真正的多进程隔离——Go 调 `exec`，Node 调 `fork`，同一条路。

## 二、何时选进程不选线程

1. **崩溃隔离**：解析不可信输入、跑原生 addon——子进程 segfault 只死自己，父进程重拉一个。
2. **端口复用**：`cluster` 让 N 个 worker 同 listen 一个端口，内核做负载均衡——单进程事件循环吃不满多核时的标准答案。
3. **内存泄漏止损**：worker 处理一批任务后退出重建，比找泄漏便宜（和 PHP-FPM 的 `max_requests` 同一思想）。

代价：IPC 全序列化（大对象先称重）、进程启动慢（fork 不是 goroutine）、调试跨 PID（日志必须带 pid，见 [ALS 追踪](/writing/node-als-tracing)——注意 ALS 不跨进程，request-id 要随消息显式传）。

## 三、cluster 一句话

`cluster.fork()` = `fork` + 端口共享 + 主从心跳。生产三件套：`cluster.on('exit', fork)` 自愈、`server.close()` 优雅摘流（见[优雅关闭](/writing/node-graceful-shutdown)）、健康检查让 LB 先摘再杀。`cluster` 不做任务分发——要分发任务自己按本篇实验的 `send/message` 模式写，或上队列。

自愈的另一面是重启风暴：子进程启动即崩、`exit` 监听器立即重拉，循环往复打满 CPU。生产必须加退避（指数退避 + 次数上限 + 告警），否则自愈变自杀——这与熔断器的“失败关闭”同一条规则，见[速率限制与熔断](/writing/rate-limiting-circuit-breaker)。重拉前先打日志（含退出码与退避次数），否则重启风暴静默发生——自愈的观测与自愈本身同等重要。

## 四、证据卡与边界

原始输出：`evidence/node-cluster-ipc/`（2026-09-20-local）。不支持：fork 启动耗时、IPC 大对象吞吐、cluster 端口复用均衡度——无压测，未验证。

## 参考资料

- Node.js 文档：child_process.fork、cluster（2026-09-20 核对）
- 前篇：并发两问（事件循环 + worker），`/writing/node-concurrency-context-cpu`
- 前篇：共享内存（线程间另一条路），`/writing/node-shared-memory-atomics`
- 前篇：优雅关闭，`/writing/node-graceful-shutdown`
