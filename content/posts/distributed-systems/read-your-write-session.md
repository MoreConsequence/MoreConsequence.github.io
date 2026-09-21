---
title: "读己之写两实现：粘性窗口覆盖 99.41%，版本门回主 0.59%"
description: "复制延迟 p50=197ms/p99=1666ms 下：粘性 2s 窗口覆盖 99.41% 写后读，版本门过期读恒 0、等待 p99=1666ms、回主仅 0.59%。用合成延迟 4 断言锁定，选型看主库余量。"
publishedAt: "2026-09-14"
tags: ["分布式系统", "复制", "一致性", "模拟"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 主从复制延迟下“刚写完立刻读”有两种实现：粘性会话——写后 2s 窗口读全打主库（覆盖 99.41%，主库多扛）；版本门——读带版本号，副本没追上就等（过期读恒 0，等待 p99 约 1666ms，回主仅 0.59%）。模拟锁定两条。选哪个看主库余量，不是看喜好。

## 一、合同

| 方案 | 保证 | 代价 | 调用者负责 |
| --- | --- | --- | --- |
| 粘性会话 | 窗口内强一致 | 主库流量 +N% | 窗口时长（覆盖 99% 延迟） |
| 版本门 | 永不过期读 | 尾延迟、回主逻辑 | 版本号透传、超时回退 |

## 二、实测

`experiments/read-your-write/ryw.py`（lognormal 合成延迟：p50=197ms、p99=1666ms，固定种子），`evidence/read-your-write/2026-09-14-local/run.out`，4 PASS（S1 覆盖 99.41%、S2 零过期读、S3 等待 p99=1666ms、S4 回主 0.59%）。

## 三、Terry 四保证：本文只实现了 RYW

Terry 等人（Bayou，PDIS'94，原稿见 [UT Austin 存档](https://www.cs.utexas.edu/~dahlin/Classes/GradOS/papers/SessionGuaranteesPDIS.pdf)）提出四个会话保证：读己之写（读看到自己之前的写）、单调读（ successive reads 看到非递减的写集合）、写跟读（写排在它所依赖的读之后，对会话外也成立）、单调写（写按会话顺序传播）。取舍原文就写明了：保证把“可执行操作的服务器”限定为足够新的子集，拿可用性换——按会话单独申请，不影响其他会话。

映射回本文：粘性窗口≈读己之写 + 单调读（窗口内全打主，一步到位）；版本门≈读己之写（等副本追上，版本号即“追上”的证据）。写跟读与单调写本文未覆盖——需要版本号随写传播，那是 outbox/因果序的领地。

```python
# 实验核心（experiments/read-your-write/ryw.py）：窗口覆盖率与回主比例
WINDOW = 2000
covered = sum(1 for l in lags if l < WINDOW) / len(lags)   # S1：窗口覆盖率
fallback = sum(1 for l in lags if l >= WINDOW) / len(lags)  # S4：回主比例
```

## 四、证据卡与边界

合成 trace，非真实复制链路。不支持：真实延迟分布、主库容量、故障切换。

## 参考资料

- Terry et al.：用 baseball 讲复制一致性（RYW/session 保证的开山解释），<https://www.microsoft.com/en-us/research/publication/replicated-data-consistency-explained-through-baseball/>
- 前篇：复制延迟与读路径，`/writing/replication-lag-read-paths`；quorum 读写与 CAP/PACELC，`/writing/consensus-02-quorum-read-write-cap-pacelc`
