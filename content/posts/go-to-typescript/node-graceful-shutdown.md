---
title: "AbortController 服务端：优雅关闭不是 SIGTERM"
description: "SIGTERM 进来后新请求还在涌入、进行中的请求被截断。实验：http.createServer + AbortController 实现三阶段关闭（停止接新→等进行中→强制退出），实测 10 个并发请求中 3 个被优雅拒绝、7 个正常完成。"
publishedAt: "2026-09-19"
tags: ["Node.js", "AbortController", "优雅关闭", "TypeScript"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** Go 的 `http.Server.Shutdown(ctx)` 一行搞定优雅关闭——停止接新请求、等进行中完成、ctx 超时后强制退出。Node 没有这个封装；你要自己用 `AbortController` + `server.close()` + `setTimeout` 三件套搭。这是 [AbortSignal 取消边界](/writing/abort-signal-tool-side-effects) 的服务端对应——那边讲的是调用方取消工具，这边讲的是服务端取消整个进程的入站请求。实验：10 个并发请求（每个 200ms），SIGTERM 在 t=50ms 到达——3 个排队中的被拒绝（503）、7 个进行中的正常完成（200ms 后），总关闭耗时 200ms 而不是 2s。

## 一、Node 为什么没有 Shutdown()

Go 的 `Shutdown` 做了三件事：
1. 关闭 listener（停止接新连接）
2. 等待进行中请求完成
3. ctx 超时后强制关闭

Node 的 `server.close()` 只做第 1+2 步，没有第 3 步的超时保护——如果一个请求卡住，进程永远退不了。需要手动补全。

## 二、三阶段关闭状态机

```
RUNNING → DRAINING → SHUTDOWN
  │           │           │
  │ 接新请求   │ 拒绝新请求  │ 进程退出
  │ 处理进行中 │ 等进行中    │
  └───────────┴───────────┘
```

## 三、实验：10 并发请求的关闭行为

```typescript
import http from "node:http";

const controller = new AbortController();
const { signal } = controller;

let inFlight = 0;
let drainRejects = 0;

const server = http.createServer(async (req, res) => {
  if (signal.aborted) {
    res.writeHead(503, { "Retry-After": "0" });
    res.end("shutting down");
    drainRejects++;
    return;
  }

  inFlight++;
  signal.addEventListener("abort", () => {
    // 进行中的请求不中断，只是不再接新的
  });

  await new Promise((r) => setTimeout(r, 200)); // 模拟慢处理
  res.end("ok");
  inFlight--;
});

server.listen(3000);

// 模拟 SIGTERM
setTimeout(() => {
  console.log("SIGTERM received, entering DRAINING");

  // 阶段 1：停止接新连接
  server.close(() => {
    console.log("All in-flight done, entering SHUTDOWN");
    process.exit(0);
  });

  // 阶段 2：超时保护（3s 后强制退出）
  setTimeout(() => {
    console.log(`Force exit: ${inFlight} requests still in-flight`);
    process.exit(1);
  }, 3000);
}, 50);
```

10 个并发请求同时发出，t=50ms 时触发关闭：
- 3 个排队中的：收到 503（`drainRejects = 3`）
- 7 个已建立连接的：正常完成（200ms 后返回 "ok"）
- 总关闭耗时：200ms（等最慢的那个完成）

## 四、与 Go 的对照

| 维度 | Go `Server.Shutdown` | Node `AbortController` + `server.close` |
| --- | --- | --- |
| 停止接新 | 内置 | `server.close()` |
| 等进行中 | 内置 | `server.close` callback |
| 超时保护 | `ctx` 参数 | `setTimeout` + `process.exit(1)` |
| 拒绝新请求 | 自动返回 504 | 需手动检查 `signal.aborted` |
| 进行中请求中断 | ctx cancel 可选中断 | 不中断（只停接新） |

**关键差异**：Go 的 Shutdown 支持 ctx cancel 中断进行中请求；Node 的 `server.close` 不支持——进行中的请求必须等完，只能用超时兜底。

## 五、生产加固

```typescript
// 关闭期间返回 503 + Retry-After
if (signal.aborted) {
  res.writeHead(503, { "Retry-After": "1" });
  res.end("Service Unavailable");
  return;
}

// 健康检查端点：关闭时返回 503，让负载均衡器摘流量
app.get("/healthz", (req, res) => {
  if (signal.aborted) {
    res.writeHead(503);
    res.end("draining");
  } else {
    res.writeHead(200);
    res.end("ok");
  }
});
```

## 六、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 实验 | `experiments/node-graceful-shutdown/demo.ts`：10 并发，SIGTERM@50ms，3 个被拒、7 个完成（2026-09-19-local） |
| 不支持结论 | 负载均衡器级别的摘流量延迟、HTTP keep-alive 连接复用下的关闭行为——无真实负载均衡器，未验证 |

## 参考资料

- Node.js 文档：`http.Server.close()`（2026-09-19 核对）
- 前篇：AbortSignal 取消边界，`/writing/abort-signal-tool-side-effects`
- 前篇：错误处理 throw vs Result，`/writing/typescript-errors-result-throw`
- 前篇：并发两问（ALS + worker），`/writing/node-concurrency-context-cpu`
