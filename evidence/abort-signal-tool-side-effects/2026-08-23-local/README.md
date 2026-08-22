# evidence/abort-signal-tool-side-effects/2026-08-23-local

AbortSignal 取消时机 × 工具副作用的对照实验。

## 环境

- darwin/arm64，Node v24.19.0，零第三方依赖
- 工具：`experiments/ts-agent-cancel/cancel-lab.mjs`（确定性模拟）、`experiments/ts-agent-cancel/real-http.mjs`（本机 HTTP 对照）

## 运行命令

```sh
node experiments/ts-agent-cancel/cancel-lab.mjs
node experiments/ts-agent-cancel/real-http.mjs
```

## 原始输出

- `sim.log`：三时机 × 两实现的矩阵。关键行：checks 工具在 t=2ms 取消（副作用已于 t≈0 提交，
  checkpoint B 在 t≈5ms）→ **调用方收到 AbortedError，账本却是 [charged]**；
  唯一零副作用路径是"调用前信号已中止"。
- `http.log`：客户端 `fetch` 于 14.4ms 收到 `AbortError`（abort 定在 10ms），
  服务端 30ms 后仍输出 `SERVER_APPLIED id=order-1`——客户端取消不撤销已到达的业务处理。

## 边界

- 模拟用显式检查点刻画"signal 只在被检查处生效"，真实代码的检查点分布因实现而异；
- HTTP 对照为单次运行的现象演示，不做统计；undici 内部各阶段的 abort 行为未逐段验证；
- 本实验只证明 Node/JS 单进程语义，不涉及分布式补偿的正确性。
