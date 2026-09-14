---
title: "CPU 下放 worker：主线程 busy 推迟 timer 40ms，worker 里只剩 1ms"
description: "主线程同步 busy 50ms 让 10ms timer 迟到 40ms；同一计算搬进 worker_threads 后 timer 误差回到 1ms。用对照实测补上 P0-05 点名的 worker 缺口。"
publishedAt: "2026-09-14"
tags: ["Node.js", "事件循环", "worker", "性能"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** 主线程 `busy(50ms)` 让 10ms timer 迟到 40ms（基线 1ms）；同一忙等搬进 `worker_threads` 后 timer 误差 1ms——CPU 下放的全部意义就是这一行对照。2 断言全过（Node v24.19.0）。这是 P0-05 验收矩阵里点名“未覆盖”的 worker 对照，[事件循环篇](/writing/typescript-event-loop-vs-gmp)的结论至此闭环：协作等待让出、CPU 忙等下放，是两条不同的路。

## 一、合同

| 负载 | 主线程 | worker | 调用者负责 |
| --- | --- | --- | --- |
| I/O 等待 | `await` 让出，不堵 timer | 不需要 | 区分等待与计算 |
| CPU 忙等 | 堵死 timer（+40ms） | timer 照跑（1ms） | 识别计算、搬运、通信成本 |
| 通信 | — | postMessage 序列化 | 大对象用 transferList |

## 二、实测

`experiments/node-worker-offload/demo.mjs`，基线 1ms / 阻塞 40ms / 下放 1ms，`evidence/node-worker-offload/2026-09-14-local/run.out`，2 PASS。

## 三、证据卡与边界

环境 Node v24.19.0。不支持：worker 池调度、transfer 性能、多核扩展比（另起 benchmark）。

## 参考资料

- Node.js 文档：worker_threads，<https://nodejs.org/api/worker_threads.html>（2026-09-14 核对）
- 前篇：事件循环 vs GMP（含 P0-05 未覆盖声明），`/writing/typescript-event-loop-vs-gmp`
