---
title: "worker 之间怎么说话：SharedArrayBuffer + Atomics"
description: "postMessage 是结构化克隆（拷贝），SharedArrayBuffer 是真共享（零拷贝），Atomics 是共享之上的互斥。对照实测：4 worker × 25000 次递增，非原子读-改-写只剩 90924/100000，Atomics.add 精确命中 100000。"
publishedAt: "2026-09-20"
tags: ["Node.js", "worker_threads", "并发", "TypeScript"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** Go 工程师习惯了 channel：在 goroutine 之间传值，天经地义。Node 的 `worker_threads` 没有 channel，只有两条路——`postMessage`（每次拷贝，大对象用 `transferList` 零拷贝转移，见[并发两问](/writing/node-concurrency-context-cpu)）和 `SharedArrayBuffer`（多线程真共享一块内存）。共享了就要互斥：`Atomics.add` 是原子递增，`Atomics.wait/notify` 是跨线程睡眠-唤醒。实测（`experiments/node-shared-memory/demo.mjs`，3 断言全过）：4 worker × 25000 次 `view[0] = view[0] + 1` 只剩 90924（每次运行不同——这正是 race 的特征），`Atomics.add` 精确命中 100000；`wait/notify` 一次握手回传 42。

## 一、两条路：拷贝 vs 共享

| 方式 | 语义 | 代价 | 适用 |
| --- | --- | --- | --- |
| `postMessage` | 结构化克隆（收发各一份） | 拷贝开销，大对象贵 | 任务分发、结果回传 |
| `postMessage` + `transferList` | 所有权转移（零拷贝） | 发送方失去访问权 | 大 Buffer 一次性下放 |
| `SharedArrayBuffer` | 多线程读写同一块内存 | 要自己做互斥 | 计数器、标志位、环形队列 |

Go 的 channel 是"拷贝 + 同步"打包；Node 把两者拆开给了你——拷贝走 `postMessage`，同步走 `Atomics`，共享走 `SharedArrayButton`（`SharedArrayBuffer`）。

## 二、非原子递增为什么丢更新

`view[0] = view[0] + 1` 是三步：读、加、写。两个 worker 同时读到 100，都加成 101 写回——一次递增凭空消失。4 worker × 25000 次，期望 100000，实测 90924，丢了约 9%。换成 `Atomics.add(view, 0, 1)`——读-改-写一条硬件原子指令——100000 精确命中。

## 三、wait/notify：跨线程的睡眠-唤醒

`Atomics.wait(view, 0, 0)` 让 worker 睡在下标 0 上（期望值 0，不符立即返回，可带超时）；主线程 `Atomics.store(view, 0, 1)` + `Atomics.notify(view, 0, 1)` 唤醒它。实测握手：worker 被唤醒后回写 42，主线程读到 42。这就是 channel 里"阻塞收"的最简形态——没有缓冲、没有多路复用（没有 `select`），只是一个 futex。

## 四、判断边界

- 计数器/标志位 → `SharedArrayBuffer` + `Atomics`（本篇）。
- 任务分发/结果回传 → `postMessage`（拷贝可接受）或 `transferList`（大对象）。
- 多生产者多消费者队列 → 自己用 SAB + Atomics 实现环形缓冲，或退回主线程中转 `postMessage`。Node 没有开箱 channel，这是从 Go 过来最需要适应的缺口。
- 跨**进程**共享内存不要碰 `SharedArrayBuffer`（它只跨线程）；进程间走 `fork` + IPC，见[多进程并发](/writing/node-cluster-ipc)。

## 五、证据卡与边界

原始输出：`evidence/node-shared-memory/`（2026-09-20-local）。非原子递增的 90924 是该次运行值，每次运行不同。不支持：`Atomics` 相对 mutex 的延迟对比、SAB 大对象带宽——无压测工具，未验证。

## 参考资料

- Node.js 文档：worker_threads、SharedArrayBuffer、Atomics（2026-09-20 核对）；MDN SharedArrayBuffer，<https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer>
- MDN：Atomics.wait/notify 语义（2026-09-20 核对）
- 前篇：并发两问（worker 下放 + transferList），`/writing/node-concurrency-context-cpu`
- 前篇：CAS 与 ABA（同一原子原语的另一面），`/writing/lockfree-cas-aba-problem`
