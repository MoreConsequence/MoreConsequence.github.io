# 连接池离散事件模拟

这份快照对应 `content/posts/connection-pool-math-timeout.md` 的两组表格。模拟使用固定 seed 生成泊松到达和指数服务时间，把请求分配给最早空闲的连接；预测等待超过 acquire timeout 的请求记为失败。

## 环境与命令

- OS：macOS 26.5.1，Darwin arm64
- Python：3.14.5，仅使用标准库
- git HEAD：`5ad95a745df8e750f7b3413ba71b1aacaa0cc9d`
- 命令：`python3 experiments/connection-pool-sim/sim.py`
- 原始输出：`raw/sim.txt`

第一组是 20 req/s、平均服务 40ms、60s、acquire timeout 500ms、seed 20260817；第二组是 40 req/s、平均服务 80ms、60s、acquire timeout 300ms、seed 20260818。文章表格直接取自 raw 输出。

## 模型边界

脚本不创建 socket，不连接 MySQL，不实现 HikariCP 或 Go `database/sql`，也没有模拟连接建立、健康检查、锁等待、重试、突发流量或真实服务时间分布。因此它只能支持“平均并发、排队和 acquire timeout 如何互相影响”的教学判断，不能支持生产池大小、吞吐、数据库 p99 或“λW×2.5 通用甜点位”的结论。
