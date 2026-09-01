# 测速服务汇总文白皮书图表重绘

## 设计合同

- 目标文章：`content/posts/speedtest-engineering/speedtest-go-deep-dive-whitepaper.md`
- 图表类型：Architecture / Data Path / Timeline / Sequence / Evidence Boundary
- 尺寸：`doc-inline`，`960 × 600`
- 读者：工程师
- 细节：balanced；每张图只保留一个主关系，复杂关系拆成独立图
- 输出：静态 HTML 工作源 + SVG；HTML 是唯一编辑源
- 配色：遵循当前 Agent 的 `diagram-design` 默认 light skin

## 图表主关系

| 图 | 读者应该读出什么 |
| --- | --- |
| `speedtest-whitepaper-measurement-model` | 上下行的计量点不同，结果受路径最短板约束 |
| `speedtest-whitepaper-bdp-window` | BDP 解释单流等待与多流的真实作用，不能把并发写成凭空增带宽 |
| `speedtest-whitepaper-backpressure` | 慢消费如何从 Recv-Q 传导到 TCP window=0，`io.Copy(Discard)`解决的是接收路径 |
| `speedtest-whitepaper-time-sampling` | 时钟语义、grace 窗口、200ms 更新和统计量是不同决策 |
| `speedtest-whitepaper-librespeed-map` | 浏览器 Worker、HTTP Handler、结果处理和数据库的真实职责边界 |
| `speedtest-whitepaper-worker-sequence` | `speedtest-go@59cff12` 的默认 `IP_D_U` 协议和可选 P 阶段 |
| `speedtest-whitepaper-evidence-boundary` | 源码事实、本机观察和生产证明不能互相替代 |

## 有意删除

- 删除原文中的 64 MB/40 Gbps/44.2 Gbps/0 allocs 等未由当前标本和证据支持的数字。
- 删除把 P90、RFC 3550、TCP_INFO、TCP_NODELAY、QUICKACK 和栈上 64 KB sink 当成 `speedtest-go` 已实现能力的图示。
- 删除 Raw TCP/WebSocket/HTTP/2/HTTP/3 雷达图；协议比较改为正文表格，因为该比较不是当前实现的实测结果。
- 删除独立的重复路由、数据库后端和脱敏方框图；这些关系分别收进源码映射图和正文表格。

## 事实边界

- 标本：`/Users/lianghaoyu/codes/speedtest-go`，commit `59cff12`。
- 本机证据：`evidence/librespeed-go-series/2026-08-26-local/`，只覆盖 Darwin/arm64、loopback、memory backend。
- `experiments/speedtest-arch/window.mjs` 是应用层爬坡统计实验，不等于真实 TCP 慢启动或公网吞吐证明。
- 图内每个实现断言都回到上述 checkout 或 evidence；没有证据的性能数字不进入图。

## 生成链

```text
generate.mjs
  → speedtest-whitepaper-*.html
  → 提取第一个 <svg>
  → 注入 XML 声明和 XML 安全的字体 import
  → public/images/speedtest-whitepaper-*.svg
```
