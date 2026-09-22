# 博客选题总仓库（topic backlog）

> 本文档是全部候选系列与单篇的单一事实源，后续逐个开发，每完成一篇/一个系列就更新状态。
> 建库日期：2026-08-16。定位：后端 → 高阶后端/AI 应用，写作即理解，文章即求职武器。
> 写作守则仍以 AGENTS.md 为准：一篇新文 ≤2 篇历史样本、实验先行、数字本机实测。

## 当前系列状态一览

| 系列 | 篇数 | 状态 |
| --- | --- | --- |
| 网络协议（TCP/IP·Nagle·QUIC 等） | 55 | ✅ 已发布 |
| Go 的设计边界 | 25 | ✅ 已发布 |
| Linux 内核网络与 eBPF 性能工程 | 9 | ✅ 5 篇已发布 + 4 篇新草稿（内存分页、Ring Buffer、脏页回写、EEVDF 调度器） |
| 分布式共识与高可用容错 | 7 | ✅ 5 篇已发布 + 2 篇新草稿（两将军问题与成员变更 Joint Consensus） |
| 大模型后端架构与推理加速 | 6 | ✅ 5 篇已发布 + 1 篇新草稿（Chunked Prefill 与 PD 分离） |
| 网络测速与极限吞吐工程 | 7 | ✅ 已发布（全 7 篇第一性原理与万兆架构实战） |
| 现代 CDN 与边缘加速架构 | 5 | ✅ 已发布（全 5 篇核心机理与全景架构） |
| 从 Go 到 TypeScript | 11 | ✅ 已发布，有扩展位 |
| 把原理变成服务 | 7 | ✅ 已发布，有扩展位 |
| Agent 的方方面面（Pi Agent 架构解析篇） | 9 | ✅ 已发布（全 9 篇底层架构解析） |
| Pi Agent 通才教程（实战与高阶专题篇） | 16 | ✅ 已发布（9 篇核心手写 + 7 篇高阶生产专题 + 配套 mini-pi 独立工程） |
| 资深工程师面试深度拆解 | 55 | 🚀 持续深耕（覆盖分布式、云原生、AI 基础设施、海量存储与高并发，全 55 篇达成） |
| 面向后端工程师的 AI 架构与工程实战 | 13 | ✅ 全 13 篇圆满竣工（总纲 + 五层架构体系 + 分层记忆系统 + 多智能体共识） |
| 物联网与网络设备云平台架构实战 | 15 | ✅ 全 15 篇圆满交付（南向协议全景、C10M网关、原子回滚、海量遥测TSDB、NAT反向终端、固件OTA、增量配置同步、设备影子孪生、分布式长连接集群、零信任安全与签名、ZTP零配置上线、YANG/OpenConfig跨厂商建模、LLDP全网物理拓扑图引擎、IBN与Batfish形式化验证、IPFIX流级遥测与微突发诊断） |
| 无系列（ai-backend-no-magic、building-a-markdown-blog） | 2 | ✅ 已发布 |


---

## 候选系列（按理解优先级排序）

### S1. LLM 应用的地基原理【新系列，最高优先】

**为什么**：知识树缺口最大的板块——token 经济学、检索数学、采样机制、工具调用契约。不依赖真实大模型也能验证（本地小模型 / 纯数学模拟 / 官方文档语义），理解它才能从"会调 API"升级为"懂 LLM 为何这样"。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| ✅ token 经济学（2026-08-16 发布） | 上下文窗口的真实成本模型：输入/输出 token 怎么计费、窗口满时会发生什么、KV 缓存代价 | tiktoken 本机实测 + 官方定价核算，scripts 见 experiments/llm-token-economics/ |
| ✅ embedding 与检索数学（2026-08-16 发布） | 相似度度量的几何直觉、召回/精排的取舍、分块策略影响 | 合成向量实验（维度灾难/归一化/分块 U 型曲线），scripts 见 experiments/llm-embedding-retrieval/ |
| ✅ 采样与温度的可复现性（2026-08-16 发布） | temperature/top-p/seed 到底改变什么、为何"不保证确定性" | 纯数学模拟（softmax 缩放/核采样截断/seed 锁定），scripts 见 experiments/llm-sampling-reproducibility/ |
| ✅ 工具调用的契约设计（2026-08-16 发布） | 函数调用如何被模型消费、schema 稳定性、错误如何喂回模型 | 确定性模拟（三种错误形状 0%/100%/100% 成功率），scripts 见 experiments/llm-tool-calling-contract/ |
| ✅ 幻觉的可测量性（2026-08-16 发布） | 幻觉不是玄学：什么场景必然幻觉、评测时如何判定 | 确定性模拟（样本量误差/不可判定题污染/分栏统计），scripts 见 experiments/llm-hallucination-measurable/ |
| ✅ 账单敏感度：同标价差 10 倍的四个乘数（2026-09-13 草稿 `llm-10-model-bill-sensitivity`） | 同 workload 下 cache 折扣/输出膨胀/命中率/长上下文附加费各放大几倍 | 纯算术模型 + 手算复核，experiments/llm-bill-sensitivity/ |
| ✅ Chunked Prefill 与 PD 分离架构（2026-09-19 草稿 `llm-13-chunked-prefill-and-pd-disaggregation`） | Roofline 冲突、Chunked Prefill 细粒度调度、跨节点 KV Cache RDMA 传输开销模型 | 纯数学与硬件带宽模拟（9 断言），experiments/llm-chunked-pd/ |

**候选 slug**：`llm-token-economics`、`llm-embedding-retrieval`、`llm-sampling-reproducibility`、`llm-tool-calling-contract`、`llm-hallucination-measurable`、`llm-13-chunked-prefill-and-pd-disaggregation`

### S2. Agent 运行时续篇【接 TS 系列 11 钩子】

**为什么**：`typescript-agent-production` 已埋钩子（会话级预算、真取消、幂等键）。最顺的延伸位，复用读者心智。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| ✅ 超时与取消的真语义（2026-08-23 草稿 `abort-signal-tool-side-effects`） | AbortSignal 连的是"请求"还是"整条 Agent 循环"？取消后工具副作用怎么办 | 三时机×两实现矩阵 + 本机 HTTP 对照，experiments/ts-agent-cancel/ |
| 写工具的幂等键 | 上次只承诺了"先写幂等键"——现在落地：200/201 语义、重放检测、并发窗口 | 接 service-idempotency 实验 + 单测 |
| 对话级预算 | 从单轮超时升级为整会话 token/步数/费用预算，超预算的优雅降级 | ✅ 2026-08-23 草稿 `agent-session-budget`：四种刹车策略 300 会话对照，experiments/ts-agent-budget/ |
| ✅ 工具死循环防护与震荡熔断（2026-09-14 初始，2026-09-19 重构跃迁 `agent-tooloop-fuse`） | 签名归一化、连续错误与双步交替震荡循环（A->B->A->B）检测、渐进式干预 | Node 确定性多模型断言（6 断言），experiments/agent-fuse/ |
| ✅ MCP 无状态化：删握手/session 后多轮去哪了（2026-09-13 草稿 `llm-09-mcp-stateless-core`） | 传输会话删除后，重试/网关路由/错误码由谁承担 | 零依赖 Node 双实例 7 断言，experiments/mcp-stateless/ |
| ✅ MCP Tasks 扩展：长任务状态放哪（2026-09-13 草稿 `llm-11-mcp-tasks-extension`） | taskId + 轮询；T4 反例证明无共享存储即 404 | 零依赖 Node 三实例 5 断言，experiments/mcp-tasks-extension/ |
| ✅ A2A 卡发现：对等体发现/版本/能力匹配（2026-09-13 草稿 `a2a-agent-card-discovery`） | 卡即配置、未知 skill 零请求、主版本拦截 | 零依赖 Node 双对等体 5 断言，experiments/a2a-card-discovery/ |

### S3. 分布式系统的故障模型【冲高阶后端硬通货】

**为什么**：已有网络协议 55 + GMP/事件循环底盘，向上做职级分水岭。面试题库常客。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| ✅ 两将军困境与“恰好一次”伪命题（2026-09-19 草稿 `two-generals-idempotency-state-machine`） | 网络不可靠时"恰好一次"为何不可证明、幂等状态机、Check-then-Act 击穿与 Fencing Token | 纯 Python 有限协议不可行性与幂等竞态模拟（8 断言），experiments/distributed-idempotency/ |
| 时钟与排序 | Lamport/向量时钟直觉、逻辑时钟 vs 墙钟、因果序 | ✅ 时钟偏移已发布；排序篇 `lamport-vector-clocks` 2026-08-23 完成草稿（固定种子模拟，experiments/lamport-vector-clocks/） |
| ✅ Raft 动态成员变更与联合一致性（2026-09-19 草稿 `consensus-07-raft-membership-changes-joint-consensus`） | 直接切换多数派断层、双主脑裂、Joint Consensus 鸽巢定理与流水线发射陷阱 | 纯 Python 集合交集与两阶段状态机断言（6 断言），experiments/raft-membership/ |
| ✅ 分布式事务三选一（2026-08-23 草稿 `two-phase-commit-vs-saga-outbox`） | 2PC / SAGA / Outbox 的故障模型与语义承诺 | 10 个故障注入点确定性矩阵，experiments/distributed-tx-faults/ |
| ✅ 窗口边界 burst：定窗 2.00x vs 滑窗 1.00x（2026-09-13 草稿 `rate-limit-window-boundary`） | 窗口边界 ±1ms 的放行数、内存代价与容量合同 | Python 标准库确定性模拟，experiments/rate-limit-window-boundary/ |

### S4. 数据库/存储原理【高阶后端另一块】

**为什么**：面试高频，已有 LSM 写放大正反例基础，扩展为完整体系。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| 事务隔离级别 | 四种隔离的异常现象、幻读/不可重复读的真实场景 | SQLite/Postgres 本机可复现实验（✅ 2026-09-14 草稿 `sqlite-tx-isolation`：WAL 读快照 + 双写 BUSY，experiments/sqlite-tx-isolation/） |
| ✅ Postgres HOT 元组与页内剪枝（2026-09-19 草稿 `postgres-hot-tuples-page-pruning`） | 行指针四状态机、LP_REDIRECT 链表折叠、fillfactor 调优与索引零膨胀 | 纯 Python 页内布局与剪枝模拟（8 断言），experiments/postgres-hot/ |
| ✅ Redis 多线程 I/O 架构解密（2026-09-19 草稿 `redis-threaded-io-architecture`） | 97.6% 网络开销、clients_pending_read 轮询分发、主线程自旋屏障与单线程命令执行 | 纯 Python 耗时周期与三阶段执行屏障状态机模拟（6 断言），experiments/redis-threaded-io/ |
| 索引选择 | B+Tree vs Hash vs 覆盖索引：何时用哪个 | 数据量与查询延迟实测 |
| 主从与一致性 | 复制延迟、读己之写、主从切换的可用性账 | docker-compose 本机集群 |

### S5. LLM 评测的科学【差异化王牌】

**为什么**：llm-as-judge 的可靠性、评测集设计陷阱，全网少有人讲透。做出来即差异化，且可作 S1 幻觉篇的延伸。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| llm-as-judge 可靠吗 | 用模型评模型的偏差来源、与人工评分的一致性 | 对照实验（同一评测集双评） |
| ✅ eval 集设计陷阱（2026-08-23 草稿 `eval-set-leakage`，系列首篇） | 数据泄漏、标签噪音、样本量幻觉 | 固定种子泄漏膨胀曲线 0/20/50/80%，experiments/eval-leakage/ |
| 回归测试 Agent | 把评测接进 CI 的工程实践 | 接 service-pipeline 扩展 |
| ✅ eval 发布门三规则（2026-09-14 草稿 `llm-12-eval-deploy-gate`） | 关键一票否决/数据集版本/抖动预算，退出码即合同 | 纯标准库 harness（v1 放行/v2 拦截），experiments/eval-deploy-gate/ |

### S6. 给 LLM 设计 API【服务系列延伸】

**为什么**：反过来从模型视角看 API——service-api-shape 已铺一半（错误形状、zod hook）。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| ✅ 错误形状喂模型（2026-09-14 草稿 `llm-error-shape-feeds-model`） | 错误码太粗/太细各会怎样、details 如何帮模型自愈 | stub 对照：粗码 0/5 vs 富 hint 5/5，experiments/error-shape-heal/ |
| schema 稳定性 | 字段改名/类型收紧对已训练模型的影响 | 契约演进演示 |

### S7. 求职素材转化【非系列，一次性】

**为什么**：存量 100 篇是资产，转化成本最低。

| 主题 | 产出 |
| --- | --- |
| ✅ 能力地图/面试叙事（2026-09-14 `capability-map-interview`） | 把已有系列编成"能力地图"：网络 → Go → TS → 服务架构 → 求职叙事 | 五段代表作 + 面试问法对照（索引篇，数字以各正文为准） |

### S8. 资深工程师面试深度拆解【全新实战系列，面向 Staff/Senior 职级突破】

**为什么**：打破传统八股文的死板背诵，直击现代高频系统设计题背后的物理本质、方案演进与连环死亡追问。每篇覆盖第一性原理推导、方案对比矩阵、破局算法与本地验证代码。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| ✅ 千万级实时排行榜设计（2026-09-19 首篇 `interview-01-realtime-leaderboard-system-design`） | 1 亿 ZSET 内存 18GB 膨胀、本地滑动窗口削峰 20 倍、浮点时间戳同分破偶与两级分层 | 纯 Python 内存核算、窗口聚合与时间戳折叠模拟（6 断言），experiments/interview-leaderboard/ |
| ✅ 千万级 LLM 智能体网关架构（2026-09-19 `interview-02-llm-agent-gateway-system-design`） | 传统 Envoy 轮询导致 KV Cache 击穿与颠簸、Radix Tree 前缀感知路由、SSE 反应式背压与两阶段动态 Token 漏桶 | 纯 Python 前缀亲和命中模拟（命中率 0%->81.5%）、Token 预扣对账与僵尸连接熔断，experiments/interview-llm-gateway/ |
| ✅ 向量数据库元数据过滤击穿 HNSW（2026-09-19 `interview-03-filtered-vector-search-hnsw`） | 后过滤低选择率召回跌零、朴素前过滤小世界图断连死锁、单阶段图内桥接遍历（ACORN/Qdrant）与自适应 CBO | 纯 Python 2% 选择率三算法对比（召回 0% vs 100%），experiments/interview-filtered-vector/ |
| ✅ Cilium 终结 kube-proxy 与套接字直通（2026-09-19 `interview-04-ebpf-sockops-kube-proxy-bypass`） | iptables 万级 Service 线性 O(N) 扫描与 xtables_lock 锁雪崩、cgroup connect4 截获与 sockops/sk_msg 绕过整个协议栈 | 纯 Python 规则复杂度对比（16000x 提速）、内核协议栈 14 层缩至 3 层（开销减少 92.9%）与 SOCKHASH 状态机，experiments/interview-ebpf-sockops/ |
| ✅ 分布式事务时钟困境 TrueTime 与 HLC（2026-09-19 `interview-05-truetime-vs-hlc-distributed-transactions`） | 隐式因果下 HLC 物理时钟偏斜因果倒错、Spanner TrueTime 置信区间与 Commit-Wait 2ε 线性一致性证明、CRDB Read Restart 代价 | 纯 Python 带外因果倒错复现、TrueTime Commit-Wait 严格线性序证明与不确定窗口重试模拟，experiments/interview-hlc-truetime/ |
| ✅ 投机采样推测解码系统设计（2026-09-19 `interview-06-speculative-decoding-system-design`） | 自回归显存带宽墙（1 FLOP/byte）、修正拒绝采样无损证明、Tree Attention 树状掩码与大 Batch 吞吐倒挂自适应门控 | 纯 Python 10万次采样无损分布验证、延迟加速比方程与 BS=64 吞吐倒挂仿真，experiments/interview-speculative-decoding/ |
| ✅ 万卡 GPU 集群分布式训练系统设计（2026-09-19 `interview-07-gpu-cluster-training-system-design`） | 贪心抢卡导致集群死锁、Gang Scheduling 原子调度、NCCL 环形慢节点 3x 传导与 2.5 秒三级异步 Checkpoint | 纯 Python 调度死锁消除、Ring AllReduce 慢卡传导与 Goodput 提升（56.9%->82.4%），experiments/interview-gpu-cluster/ |
| ✅ 超低延迟证券撮合交易系统（2026-09-19 `interview-08-stock-exchange-matching-engine`） | 单核单线程纯内存撮合哲学、定序器（Sequencer）全局自增定序、LMAX Disruptor 无锁环形队列与伪共享消除、DFA 确定性重放 | 纯 Python 价格时间优先撮合、WAL 状态机重放 100% 同态验证与 0 锁切换，experiments/interview-stock-exchange/ |
| ✅ 分布式数字钱包与复式记账（2026-09-19 `interview-09-distributed-digital-wallet-system-design`） | 1494年 Luca Pacioli 复式记账公理、Pat Helland 叛逆者论文解构 2PC、不可变事件溯源账本与热点商户分段钱包防死锁 | 溯源 Pacioli 与 Helland 奠基论文、复式记账不可变模型与分段钱包架构（按新规范免冗余实验），文献与官方源码支撑 |
| ✅ 海量对象存储系统 S3 架构设计（2026-09-19 `interview-10-s3-object-storage-system-design`） | POSIX inode 耗尽与元数据/数据解耦、Haystack 追加聚合 Chunk、纠删码（EC 8+4）对比多副本与分片零拷贝合流 | 溯源 Beaver OSDI 2010 与 Reed-Solomon 1960、海量小文件打包与 EC 存储成本核算（按新规范免冗余实验），工业标准规范支撑 |
| ✅ 分布式消息队列架构设计（2026-09-19 `interview-11-distributed-message-queue-system-design`） | Zero-Copy sendfile 穿透内核、PageCache 脏页回写停顿、Kafka 分区重平衡风暴与 Pulsar 存储计算分离演进 | 溯源 Kreps 2011 NetDB 论文、DMA 散布收集零拷贝、Segment 分段与分层存储（免冗余实验，结合内核系统调用与权威论文） |
| ✅ 百万 QPS 实时位置与附近的人（2026-09-19 `interview-12-proximity-nearby-friends-system-design`） | 经纬度多维索引困境、GeoHash 空间填充曲线与 Google S2 希尔伯特四叉树投影、网格跳跃与动态广播风暴 | 空间填充曲线降维证明、S2 Cell ID 与 Redis Pub/Sub / WebSocket 扩散模型（按规范免冗余实验） |
| ✅ 亿级高并发实时聊天系统架构（2026-09-19 `interview-13-chat-system-architecture`） | 单机百万长连接 Linux Epoll 内存开销、心跳保活与惊群重连风暴、消息绝对因果序与读扩散 vs 写扩散权衡 | 溯源 Leslie Lamport 因果时序、单机 C10M 内存精算、读写扩散混合架构（按规范免冗余实验） |
| ✅ 千万级实时广告点击事件聚合系统（2026-09-19 `interview-14-ad-click-event-aggregation`） | Lambda 架构双维护灾难与 Kappa 统一日志流、Event Time vs Processing Time、Watermark 水位线延迟处理与端到端 Exactly-Once 语义 | 溯源 Tyler Akidau Dataflow 论文、Chandy-Lamport 分布式快照与二阶段提交 Sink 幂等对账（按规范免冗余实验） |
| ✅ 金融级分布式支付系统架构（2026-09-19 `interview-15-payment-system-architecture`） | 三方支付渠道超时与拜占庭状态、幂等性令牌防重复扣款、分布式事务对账（Reconciliation）与资金安全兜底防线 | 溯源两将军问题与三方支付状态机、幂等键两阶段校验、异步对账与平账闭环（按规范免冗余实验） |
| ✅ 高并发酒店与票务预订系统（2026-09-19 `interview-16-hotel-reservation-system`） | 连续日期多维库存扣减、悲观锁 vs 乐观锁 vs Redis Lua 原子预扣、分布式死锁消除与延时关单超时回滚 | 溯源多版本并发控制（MVCC）与超卖边界、两阶段库存预留、时间轮延时队列与库存对齐闭环（按规范免冗余实验） |
| ✅ 分布式全局唯一 ID 的十年演进（2026-09-19 `interview-17-distributed-unique-id-generator`） | 从 Flickr Ticket Server 到 Twitter Snowflake、2024年 IETF RFC 9562 UUIDv7、时钟回拨容死机制与 B+ 树页分裂物理实测 | 溯源 Leach-Salz 1998 与 RFC 9562、NTP 时钟回拨容死算法、B+ 树随机插入碎片机理（按规范免冗余实验，结合权威规范与工业源码） |
| ✅ 千万级分布式限流系统架构（2026-09-19 `interview-18-distributed-rate-limiter`） | 固定窗口临界突变、滑动日志内存膨胀、令牌桶 vs 漏桶、Redis Lua 集群原子限流与 Netflix 动态自适应限流 | 溯源 RFC 1633 令牌桶数学模型、单机本地缓存与 Redis 集群令牌分发、基于 RTT 的 BBR 梯度自适应限流（按规范免冗余实验） |
| ✅ 分布式键值存储系统的物理基石（2026-09-19 `interview-19-distributed-key-value-store`） | 从 Amazon Dynamo 论文看最终一致性、LSM-Tree 读写放大与 SSTable 压缩、Quorum NWR 模型与 Merkle Tree 反熵修复 | 溯源 DeCandia 2007 SOSP Dynamo 论文、向量时钟（Vector Clock）冲突检测、Read Repair 与 Gossip 协议（按规范免冗余实验） |
| ✅ 千万级社交动态流 Feed 系统架构（2026-09-19 `interview-20-news-feed-system-design`） | 推模式（写扩散）vs 拉模式（读扩散）物理极限、贾斯汀·比伯/大 V 粉丝写放大雪崩、混合推拉模型与游标分页（Cursor Pagination） | 溯源社交网络拓扑度分布（Power Law）、Redis ZSET 活跃流缓存、Offset 深度分页跳步与游标防抖（按规范免冗余实验） |
| ✅ 一致性哈希系统的物理演进（2026-09-19 `interview-21-consistent-hashing-system-design`） | 模数哈希扩容雪崩、Karger 1997 环形映射与虚拟节点平衡度方差推导、Google Maglev 查表重排与 5 行代码 Jump Hash | 溯源 Karger 1997 STOC 开山论文、虚拟节点标准差收敛曲线、Google Maglev 查表置换与 Jump Consistent Hash（按规范免冗余实验） |
| ✅ 千万级搜索自动补全系统架构（2026-09-19 `interview-22-search-autocomplete-system-design`） | 毫秒级前缀匹配瓶颈、Trie 字典树节点 Top-K 堆预存空间换时间、前缀哈希树、离线快照构建与在线热词动态加权 | 溯源 Edward Fredkin 1960 Trie 树开山之作、Trie 节点内存压缩、离线批处理与在线无锁切表（按规范免冗余实验） |
| ✅ 超大规模视频流媒体系统架构（2026-09-19 `interview-23-video-streaming-system-design`） | 视频切片转码 DAG 流水线、HLS/DASH 自适应码率（ABR）、元数据与视频 Chunk 解耦存储、边缘 CDN 多级防穿透 | 溯源 ISO/IEC MPEG-DASH 与 Apple RFC 8216 HLS、视频分块并行转码、Netflix 镜头分块编码与 CDN 回源保护（按规范免冗余实验） |
| ✅ 分布式云盘与文件同步系统架构（2026-09-19 `interview-24-cloud-drive-file-sync-system-design`） | 块级分块（Chunking）、Rabin 指纹内容定义分块（CDC）、SHA-256 内容寻址去重与两阶段差异同步（Delta Sync） | 溯源 Andrew Tridgell 1996 Rsync 滚动哈希算法、块级去重存储、差分同步状态机与并发冲突分支合并（按规范免冗余实验） |
| ✅ 千万级时序监控告警系统架构（2026-09-19 `interview-25-metrics-monitoring-alerting-system-design`） | 高频写多读少时序模型、Facebook Gorilla 时间戳二阶差分与浮点数 XOR 极致压缩、分级降采样（Downsampling）与告警状态机 | 溯源 Pelkonen 2015 VLDB Gorilla 论文、IEEE 754 浮点压缩位级演算（16 字节压至 1.37 字节）、LSM 时序分块与内存映射（按规范免冗余实验） |
| ✅ 百亿级分布式网络爬虫系统架构（2026-09-19 `interview-26-distributed-web-crawler-system-design`） | URL 边界（Frontier）优先级与礼貌性调度（Politeness）、布隆过滤器百亿去重、异步 DNS 解析缓存与陷阱环路防御 | 溯源 Najork & Heydon 2001 高性能爬虫开山之作、两级队列流控拓扑、分布式状态机与内容指纹相似度去重（按规范免冗余实验） |
| ✅ 百亿级分布式短链系统架构（2026-09-19 `interview-27-url-shortener-system-design`） | Base62 编码数学基石、分布式发号器 vs 哈希碰撞容灾、HTTP 301 vs 302 深度权衡、多级缓存击穿与单点热热链防护 | 溯源 RFC 3986 URI 规范、Base62 双向映射、布隆过滤器空值阻断与 Redis 热点分段缓存（按规范免冗余实验） |
| ✅ 分布式任务调度与工作流编排系统（2026-09-19 `interview-28-distributed-task-scheduler-system-design`） | 分层时间轮（Hierarchical Timing Wheel）O(1) 调度、DAG 依赖拓扑排序、分片广播与分布式租赁锁（Lease）故障漂移 | 溯源 Varghese & Lauck 1987 时间轮开山之作、Temporal / XXL-JOB 调度拓扑、心跳租约与工作流幂等补偿（按规范免冗余实验） |
| ✅ 实时协同文档系统架构与一致性演进（2026-09-19 `interview-29-collaborative-editing-ot-crdt-system-design`） | 操作转换（OT）状态爆炸困境、无冲突复制数据类型（CRDT）状态收敛数学证明、因果树结构与百万字符显存压榨 | 溯源 Ellis & Gibbs 1989 OT 论文、Marc Shapiro 2011 CRDT 形式化证明、Yjs 双向链表剪枝与点对点信令拓扑（按规范免冗余实验） |
| ✅ 亿级高可靠分布式消息推送通知系统（2026-09-19 `interview-30-notification-system-architecture`） | 多通道（APNs/FCM/SMS/Email）流量塑形、优先级弹性队列、防轰炸频控漏斗与跨通道幂等去重状态机 | 溯源推拉结合通知流、令牌桶多维限流、用户偏好矩阵位图过滤与死信重试退避协议（按规范免冗余实验） |
| ✅ 分布式锁的物理边界与 Redlock 论战（2026-09-19 `interview-31-distributed-lock-redlock-fencing-token`） | Martin Kleppmann 与 Redis 作者 Antirez 历史论战、GC 停顿与物理时钟跳变击穿、Chubby/etcd 租约与单调 Fencing Token 形式化验证 | 溯源 Burrows 2006 Chubby 论文与 2016 年 Redlock 经典学术论辩、Fencing Token 序列防乱序写入、etcd MVCC 事务原子租约（按规范免冗余实验） |
| ✅ 基数统计与百亿 UV 计数系统架构（2026-09-19 `interview-32-hyperloglog-count-min-sketch-cardinality`） | 集合去重内存爆炸、HyperLogLog 伯努利试验极大似然估计与调和平均数消除方差、Count-Min Sketch 频次估算与 Top-K 重尾堆 | 溯源 Flajolet 2007 HyperLogLog 经典论文、12KB 内存统计百亿基数数学证明、偏斜分布误差界与工业级混合稀疏存储（按规范免冗余实验） |
| ✅ 全球出行打车调度与动态定价系统架构（2026-09-19 `interview-33-ride-sharing-dispatch-h3-geospatial`） | 空间几何索引对决：GeoHash 矩形畸变 vs Uber H3 六边形离散全局网格、司机乘客两阶段双边匹配图（Bipartite Matching）与动态热力峰时溢价 | 溯源 Uber H3 空间网格开源规范、Kuhn-Munkres 匈牙利二分图匹配算法、空间环形聚合与冷热潮汐供需平衡状态机（按规范免冗余实验） |
| ✅ 全链路分布式追踪系统架构（2026-09-19 `interview-34-distributed-tracing-dapper-opentelemetry`） | 微服务黑盒排障困局、Google Dapper 论文开山之作、W3C TraceContext 跨进程上下文传递、头部采样（Head）vs 尾部自适应采样（Tail-based Sampling） | 溯源 Sigelman 2010 Google Dapper 论文、W3C Trace Context 规范、尾部采样微服务链路还原与 ClickHouse 亿级 Span 存储（按规范免冗余实验） |
| ✅ 分布式事务的终局决战（2026-09-19 `interview-35-distributed-transactions-2pc-tcc-saga-local-message`） | Jim Gray 1978 2PC 阻塞挂起缺陷、Saga 长事务补偿模型、TCC 悬挂与空回滚防御、本地消息表与 Transactional Outbox 模式 | 溯源 Gray 1978 2PC 论文、Garcia-Molina 1987 Saga 论文、两阶段资源预留状态机与基于 CDC 的 Outbox 幂等最终一致性（按规范免冗余实验） |
| ✅ 千万级数据库分库分表与在线平滑迁移（2026-09-19 `interview-36-database-sharding-online-migration`） | B+ 树层级跃升与单表千万瓶颈、分片键基因哈希与跨分片分页查询归并、双写双跑（Dual-Write）与毫秒级无损灰度切流 | 溯源数据库物理页分裂成本、基因分片联合索引推导、增量 CDC 差异对账与两阶段平滑切流状态机（按规范免冗余实验） |
| ✅ 亿级高并发实时直播弹幕系统架构（2026-09-19 `interview-37-live-streaming-danmaku-system-design`） | 百万观众同屏弹幕洪峰、Epoll 长连接 C10M 内存精算、写扩散 vs 读扩散扇出、智能丢帧限速与边缘 CDN 弹幕分发树 | 溯源单机百万 WebSocket 内存调优、优先级丢帧漏斗、房间级广播网格与客户端弹幕碰撞规避算法（按规范免冗余实验） |
| ✅ 云原生 API 网关与热插件架构（2026-09-19 `interview-38-cloud-native-api-gateway-envoy-apisix`） | Nginx 静态 Reload 性能抖动与 Kong/APISIX 动态路由、Envoy xDS 控制面与数据面解耦、Wasm 轻量级沙箱插件热加载与全链路零拷贝 | 溯源 Envoy 动态配置 xDS 协议、WebAssembly 线性内存沙箱开销、基数树（Radix Tree）毫秒级动态路由匹配与内存池化（按规范免冗余实验） |
| ✅ 分布式共识协议的工业演进（2026-09-19 `interview-39-distributed-consensus-paxos-raft-multiraft`） | Leslie Lamport 兼职国会 Paxos 难以理解的悲剧、Ongaro Raft 强主复制与心跳选举、TiKV/CockroachDB Multi-Raft 分区切片与热点自愈 | 溯源 Lamport 1998 Paxos 论文、Ongaro & Ousterhout 2014 Raft 论文、Region 分裂合并与 Joint Consensus 联合共识成员变更（按规范免冗余实验） |
| ✅ 亿级实时在线推荐系统架构（2026-09-19 `interview-40-realtime-recommendation-engine-architecture`） | 召回（Retrieval）- 粗排 - 精排 - 重排四级流式管道、双塔 DSSM 模型、Feature Store 特征毫秒级穿透与实时反作弊漏斗 | 溯源 Covington 2016 YouTube 深度推荐系统论文、实时特征流与离线批处理对齐、向量 ANN 检索与服务端打散保活（按规范免冗余实验） |
| ✅ 分布式文件系统的物理基石（2026-09-19 `interview-41-distributed-file-system-gfs-hdfs-ceph`） | GFS/HDFS 单 Master/NameNode 内存元数据耗尽与 JVM GC 暂停、Ceph CRUSH 算法通过纯数学计算消除中心寻址表、对象与块存储解耦 | 溯源 Sanjay Ghemawat 2003 Google GFS 论文、Sage Weil 2006 OSDI Ceph 论文、CRUSH 伪随机数据放置图推导与一致性保障（按规范免冗余实验） |
| ✅ 毫秒级广告实时竞价系统架构（2026-09-19 `interview-42-realtime-bidding-ad-exchange-rtb`） | 100ms 硬实时网络超时预算、DSP/SSP 双边高并发竞价拍卖、平滑预算消耗（Budget Pacing）流控与防虚假点击欺诈 | 溯源 Google DoubleClick RTB 协议规范、二阶价格拍卖（Vickrey Auction）博弈模型、令牌漏桶与实时预算消耗反馈控制环（按规范免冗余实验） |
| ✅ 千亿边分布式图数据库与巨节点裂解架构（2026-09-19 `interview-43-distributed-graph-database-supernode`） | 幂律分布（Power-law）下的超级大 V 巨节点（Supernode）遍历爆炸、Pregel BSP 大步同步模型、边切分（Edge Cut）vs 点切分（Vertex Cut）图分区与分布式两跳关系链剪枝 | 溯源 Malewicz 2010 Google Pregel 论文、Barabási 无标度网络拓扑、点切分复制顶点协议与超大节点子图折叠优化（按规范免冗余实验） |
| ✅ 边缘计算与全球 CDN 多级缓存架构（2026-09-20 `interview-44-edge-computing-cdn-request-collapsing`） | BGP Anycast 就近路由寻址、请求折叠（Request Collapsing）防源站穿透、大文件 Range 切片多级边缘缓存与边缘 Serverless 动静分离 | 溯源 BGP Anycast 选路规范、RFC 7233 HTTP Range 规范、Nginx/Varnish 请求合并状态机与边缘 Key-Value 弱网自愈（按规范免冗余实验） |
| ✅ 生产级分布式向量数据库架构（2026-09-20 `interview-45-distributed-vector-database-scale`） | 标量与向量分离存储（Disaggregated Storage）、多维度分片与动态 CBO 成本优化、实时流式 WAL 写入与后台不可变 Segment 聚类索引构建 | 溯源 Malkov 2018 HNSW 论文、Milvus / Qdrant 存储计算分离设计、两阶段两路归并向量检索与内存 mmap 池化（按规范免冗余实验） |
| ✅ 服务网格 Service Mesh 的终局演进（2026-09-20 `interview-46-cloud-native-service-mesh-ambient-ebpf`） | 传统 Sidecar 模式每个 Pod 注入 Envoy 的内存巨额浪费（数万 Pod 耗费数百 GB）与两跳网络延迟、Istio Ambient Mesh 分层解耦与 Cilium eBPF 套接字免 Sidecar 内核直通 | 溯源 Istio Ambient Mesh 白皮书、Linux 内核 sockops 套接字重定向、L4 ztunnel 与 L7 waypoint 代理分层治理与 mTLS 零信任加固（按规范免冗余实验） |
| ✅ 全球多活多单元化架构（2026-09-20 `interview-47-multi-region-cell-based-architecture`） | 爆炸半径（Blast Radius）收敛、单元内自包含闭环与全局路由网关、单向数据同步与跨单元多写冲突消解（CRDT vs 状态机租约） | 溯源 AWS Well-Architected 单元化白皮书、异地多活流量染色（Traffic Coloring）与数据分片路由防脑裂机制（按规范免冗余实验） |
| ✅ 新一代 LSM-Tree 存储引擎与 SSD 物理调优（2026-09-20 `interview-48-lsm-tree-rocksdb-nvme-ssd-tuning`） | RUM 猜想（读/写/空间放大三难绝境）、跳表（SkipList）并发无锁写入、Leveled vs Universal 压实穿透、ZNS 分区存储规避 SSD 二次垃圾回收 | 溯源 O'Neil 1996 LSM-Tree 论文、RocksDB 工业源码实现、布隆过滤器假阳性位级推导与 Direct I/O 零拷贝（按规范免冗余实验） |
| ✅ 大模型长上下文注意力与显存虚拟化（2026-09-20 `interview-49-llm-flash-attention-paged-attention-mla`） | 标准注意力 $O(N^2)$ 显存爆炸、FlashAttention SRAM/HBM 访存分块平铺（Tiling & Online Softmax）、vLLM PagedAttention 虚拟内存分页与 DeepSeek MLA 低秩投影压缩 | 溯源 Dao 2022 FlashAttention 论文、Kwon 2023 vLLM 论文、DeepSeek-V2/V3 MLA 显存压缩数学推导与计算访存比分析（按规范免冗余实验） |
| ✅ 亿级点对点实时音视频通信架构（2026-09-20 `interview-50-webrtc-sfu-mcu-gcc-congestion-control`） | P2P Mesh 拓扑网络连接爆炸（$O(N^2)$）、MCU 集中混流高 CPU 损耗 vs SFU 选择性媒体路由、Google GCC 延迟/丢包双驱动自适应拥塞控制算法 | 溯源 RFC 8825 WebRTC 架构、RFC 8888 RTP 拥塞控制反馈、卡尔曼滤波延迟梯度估算与 Simulcast/SVC 自适应分层码率（按规范免冗余实验） |
| ✅ 现代高性能内存分配器架构（2026-09-20 `interview-51-memory-allocator-jemalloc-mimalloc-ptmalloc`） | glibc ptmalloc 多核锁争用与内存碎片、jemalloc 多阶 Size Class 与线程局部缓存（tcache）、mimalloc 自由链表分片与页级重用 | 溯源 Jason Evans jemalloc 论文、Daan Leijen mimalloc 论文、brk vs mmap 内核边界与透明大页（THP）分配卡顿治理（按规范免冗余实验） |
| ✅ 跨数据中心高可用分布式协调服务（2026-09-20 `interview-52-distributed-coordination-etcd-zookeeper`） | ZooKeeper 临时顺序节点与 Watcher 惊群风暴、etcd v3 MVCC 机制与流式 Watch、Martin Kleppmann 分布式锁 Fencing Token 形式化分析 | 溯源 Hunt 2010 ZooKeeper 论文、etcd bbolt 事务引擎、异步复制脑裂与网络分区租约保活状态机（按规范免冗余实验） |
| ✅ 现代高性能 RPC 框架内核解密（2026-09-20 `interview-53-high-performance-rpc-grpc-flatbuffers`） | JSON/Protobuf 反序列化 CPU 内存税、FlatBuffers 零拷贝就地内存访问、gRPC HTTP/2 多路复用流控与级联超时传递 | 溯源 Google FlatBuffers 编码规范、gRPC 线程模型与 Netty EventLoop 阻塞排查、分布式追踪 TraceContext 级联取消（按规范免冗余实验） |
| ✅ 现代大规模湖仓一体架构（2026-09-20 `interview-54-lakehouse-acid-iceberg-delta-lake`） | Hive 元数据目录模型在数百万分区下的 O(N) LIST 性能崩溃、Apache Iceberg 树状元数据清单（Manifest）、快照隔离与乐观并发控制（OCC） | 溯源 Ryan Blue Apache Iceberg 设计、隐式分区演进、行级更新 Copy-on-Write vs Merge-on-Read 权衡与小文件 Compaction（按规范免冗余实验） |
| ✅ 大规模异步任务流水线与死信治理（2026-09-20 `interview-55-async-task-pipeline-dead-letter-retry`） | 网络短暂抖动引发千倍重试风暴（Retry Storm）、全抖动指数退避算法（Full Jitter Backoff）数学证明、死信队列（DLQ）毒丸隔离与平滑下线 | 溯源 AWS 指数退避数学模型、RocketMQ/Redis 延时队列时间轮、SIGTERM 优雅停机与飞航任务泄洪排空状态机（按规范免冗余实验） |



### S9. 面向后端工程师的 AI 架构与工程实战【全新重磅实战系列】

**为什么**：打破纯理论调参和玩具级 Prompt 搬砖的两极断层。后端工程师面对的核心物理约束是：大模型是高延迟、高成本、显存带宽受限、且输出天然概率非确定性的三方黑盒。本系列直击如何用确定性的工程架构驯服非确定性模型，构建生产级高并发、可观测、低成本的 AI 基础设施与智能体运行时。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| ✅ AI 后端五层架构总纲（2026-09-20 专栏总览 `ai-backend-00-architecture-blueprint`） | 破除无头苍蝇困境的五层生产级心智模型、三大不可逆物理铁律（显存带宽受限、Token成本非对称、概率黑盒）、穿透开源框架炒作看清系统本质 | 溯源 Dean 2013 尾部延迟理论、PagedAttention 显存模型、五层全景架构拓扑与后端灵魂四问决策树（按规范免冗余实验） |
| ✅ 结构化输出与受限解码（2026-09-20 首篇 `ai-backend-01-constrained-decoding-structured-outputs`） | 提示词请输出 JSON 的必然崩溃、上下文无关文法（CFG）编译为确定性有限状态自动机（FSM）、采样阶段在 Logits 概率分布上做 Token 动态掩码（Masking）彻底消除格式错误 | 溯源 Willard & Louf 2023 Outlines 论文、JSON Schema 到 DFA 状态转移、vLLM/XGrammar 词表索引前缀树（Trie）与微秒级掩码实现（按规范免冗余实验） |
| ✅ 大模型流式网关与 SSE 背压流控（2026-09-20 `ai-backend-02-streaming-gateway-sse-backpressure`） | 传统 Nginx/Kong 遭遇长连接长轮询内存耗尽、Server-Sent Events（SSE）与 Chunked 传输、客户端 Abort 级联中断 GPU 显存推理与 TCP 滑窗背压协调 | 溯源 RFC 8895 SSE 规范、Envoy LLM Filter 状态机、客户端断连取消与动态 Token 漏桶（按规范免冗余实验） |
| ✅ 企业级生产 RAG：混合检索、RRF 与重排（2026-09-20 `ai-backend-03-enterprise-rag-hybrid-search-rerank`） | 单纯向量检索对专有名词/料号的召回崩溃、BM25 稀疏索引 + HNSW 稠密向量双路召回、倒数排名融合（RRF）数学推导与 Cross-Encoder 深度重排 | 溯源 Cormack 2009 RRF 论文、两阶段漏斗过滤、Lost in the Middle 规避与文档切块重叠边界（按规范免冗余实验） |
| ✅ 语义缓存（Semantic Cache）架构与高并发防击穿（2026-09-20 `ai-backend-04-semantic-cache-architecture`） | 传统字符串缓存命中率归零、高维向量相似度阈值判定、余弦距离漂移、缓存雪崩与动态 TTL 衰减、向量近似检索作为大模型护城河 | 溯源 GPTCache 架构、Redis VSS 向量检索插件、Faiss 内存索引与热点问答穿透防御（按规范免冗余实验） |
| ✅ 大模型上下文缓存（Prompt Caching）与 Token 成本工程（2026-09-20 `ai-backend-05-prompt-caching-finops-engineering`） | 写入成本与极低读取折扣的 10 倍差距、System Prompt 动静分离与字节级前缀严格对齐、大小模型投机路由（Cascade Routing）削减 80% 成本 | 溯源 Anthropic Prompt Caching 规范、OpenAI 计费数学模型、批量离线 Batch API 调度（按规范免冗余实验） |
| ✅ Model Context Protocol（MCP）协议工程解密（2026-09-20 `ai-backend-06-mcp-protocol-engineering`） | 统一模型上下文协议标准、JSON-RPC 2.0 传输层（stdio 管道 vs SSE HTTP）、Tools / Resources / Prompts 原语生命周期、后端微服务无感接入标准 MCP Server | 溯源 Anthropic MCP 官方规范、JSON-RPC 2.0 协议规范、无状态网关路由与多轮会话状态存储（按规范免冗余实验） |
| ✅ Agent 自主代码执行的安全沙箱架构（2026-09-20 `ai-backend-07-agent-code-execution-sandbox`） | Agent 自主运行 Python/Bash/SQL 代码的提权逃逸风险、Docker 容器共享内核隐患、gVisor 用户态独立内核虚拟化 vs Firecracker microVM 极速冷启动 | 溯源 Google gVisor 白皮书、AWS Firecracker microVM 架构、Linux cgroups v2 命名空间单向出站防火墙（按规范免冗余实验） |
| ✅ 确定性 Agent 状态机与断点恢复（2026-09-20 `ai-backend-08-deterministic-agent-state-machine`） | 简单 while 循环在长耗时任务崩溃时的不可靠性、状态快照与事件溯源（Event Sourcing）、时间旅行、Human-in-the-loop 人工挂起与审批流 | 溯源 Temporal Durable Execution 规范、LangGraph 状态图模型、状态持久化与重放状态机（按规范免冗余实验） |
| ✅ 大模型全链路分布式追踪（GenAI Observability）（2026-09-20 `ai-backend-09-genai-observability-opentelemetry`） | 传统 APM 无法捕捉 Token 与提示词链路、OpenTelemetry GenAI 语义约定规范（Semantic Conventions）、Span 级捕获 Prompt、TTFB、TPS 与调用代价 | 溯源 OpenTelemetry GenAI 规范、Langfuse 链路采集架构、分布式 TraceID 穿透大模型网关（按规范免冗余实验） |
| ✅ 自动化评测门禁（LLM-as-a-Judge）工程化落地（2026-09-20 `ai-backend-10-llm-as-a-judge-eval-engineering`） | 代码迭代中模型质量回归检测、位置偏差（Position Bias）、冗长偏差（Verbosity Bias）、自夸偏差防御、CI/CD 自动化评测门禁拦截与置信区间 | 溯源 Zheng 2023 Judging LLM-as-a-Judge 论文、CI/CD Eval Harness、Kappa 一致性统计学校验（按规范免冗余实验） |
| ✅ 智能体分层记忆系统与遗忘曲线架构（2026-09-20 `ai-backend-11-agent-memory-systems-architecture`） | 上下文窗口爆炸与跨会话记忆遗忘、工作记忆/情景流/语义图谱/程序技能四层映射、艾宾浩斯遗忘曲线衰减方程与后台异步睡眠反思提炼 | 溯源 Park 2023 斯坦福小镇论文、Ebbinghaus 1885 遗忘曲线数学模型、MemGPT 分层内存与三维激活打分引擎（按规范免冗余实验） |
| ✅ 复合多智能体协同与分布式共识（2026-09-20 `ai-backend-12-multi-agent-orchestration-consensus`） | 单体 Agent 认知瓶颈、中央编排 vs 事件驱动黑板模式、A2A 协议能力卡协商、孔多塞陪审团定理多轮辩论共识与通信死锁熔断 | 溯源 Zaharia 2024 Compound AI 架构、Du 2023 Multi-Agent Debate 论文、Condorcet 1785 陪审团定理与全局会话原子预算池（按规范免冗余实验） |
| ✅ 投机采样与推测解码高并发落地（2026-09-20 `ai-backend-13-speculative-decoding-production-serving`） | 自回归 Decode 显存带宽受限（1 FLOP/Byte）、修正拒绝采样无损严格证明、Medusa/Eagle 树状注意力与高并发批处理（BS>=64）算力吞吐倒挂自适应退火流控 | 溯源 Leviathan 2023 投机采样论文、Eagle 2024 特征推测模型、修正残差分布数学证明与动态流控阈值（按规范免冗余实验） |
| ✅ 智能体工具调用自愈与容错闭环（2026-09-20 `ai-backend-14-agent-tool-use-self-healing-loop`） | 生产级工具调用脆弱性、错误形态四象限（瞬态网络/契约语法/安全权限/领域业务）、紧凑差分式 JSONPath 诊断报告（防堆栈注意力污染）、双步交替震荡循环（A->B->A->B）熔断与副作用写操作幂等隔离 | 溯源 RFC 9457 错误细节规范、Toolformer 2023 论文、规范化签名滑动窗口 N-gram 环路检测与会话级幂等键（按规范免冗余实验） |
| ✅ 模型级联路由与 SLA 容灾策略（2026-09-20 `ai-backend-15-llm-routing-and-fallback-cascade`） | 生产流量复杂度 70-20-10 长尾分布与单旗舰模型成本浪费、Pareto 最优前沿模型梯队（8B->70B->405B）、流式中途断裂（Mid-Stream Rupture）微缓冲与断点续接提示缝合、多 Provider 动态健康感知滑动熔断 | 溯源 FrugalGPT 2023 与 RouteLLM 2024 论文、RFC 8895 SSE 规范、微秒级复杂度意图分流与跨云高可用容灾网关（按规范免冗余实验） |
| ✅ PagedAttention 与显存虚拟化深度解密（2026-09-20 `ai-backend-16-paged-attention-kv-cache-virtual-memory`） | 操作系统虚拟内存分页哲学、连续显存预分配 80% 碎片浪费、物理块与逻辑块 Block Table 动态映射、写时复制（CoW）零拷贝共享、MHA/GQA/MLA 显存精算与 Swap 换入换出 | 溯源 Kwon 2023 SOSP PagedAttention 论文、DeepSeek MLA 架构、物理页表调度器与显存防 OOM 抢占（按规范免冗余实验） |
| ✅ 长上下文外推、RoPE 与注意力黑洞（2026-09-20 `ai-backend-17-long-context-rope-attention-sinks`） | 绝对位置编码局限、RoPE 旋转位置编码相对距离复数几何变换、长上下文外推困惑度爆炸、NTK-Aware 动态高低频齿轮缩放、StreamingLLM 头部 4 Token 注意力黑洞（Attention Sink）与无限流式 O(1) 显存滑动窗口 | 溯源 Su 2021 RoPE 论文、Xiao 2024 ICLR StreamingLLM 论文、Softmax 归一化注意力汇聚数学推导与恒定显存环形缓存（按规范免冗余实验） |
| ✅ 长耗时 AI 任务异步架构设计（2026-09-20 `ai-backend-18-async-job-queues-temporal-webhooks`） | 同步 HTTP 在 AI 场景破产（Nginx 504 与线程池耗尽）、HTTP 202 提单与指数抖动轮询状态机、SSE 长任务断网重连（Last-Event-ID）、三方 Webhook HMAC-SHA256 签名鉴权防重放与死信重试 | 溯源 RFC 9110 HTTP 202 规范、Standard Webhooks 规范、Redis 任务状态机与 Temporal 持久化编排（按规范免冗余实验） |
| ✅ 关系型数据库工程师的 pgvector 实战（2026-09-20 `ai-backend-19-pgvector-relational-engineers-guide`） | 破除独立向量库双写撕裂迷信、从 B-Tree 精确匹配到 HNSW 高维小世界跳表图、L2/内积/余弦三算子与 AVX-512 CPU 加速、低选择率多租户混合过滤（Filtered Search）执行计划调优与部分索引（Partial Index） | 溯源 Malkov 2018 HNSW 论文、pgvector 0.7.0 迭代扫描机制、ACID 单库事务与混合查询索引工程（按规范免冗余实验） |
| ✅ 后端视角下的提示词工程（2026-09-20 `ai-backend-20-prompt-engineering-backend-code`） | 提示词即不可变代码资产（Prompt as Code）、类比 SQL 注入的提示词注入（Prompt Injection）物理成因、XML 标签沙箱物理定界防御、Jinja2 模板变量安全过滤、Prompt 语义版本管理（SemVer）与配置中心灰度金丝雀发布 | 溯源 OWASP Top 10 LLM01 规范、Anthropic XML 提示词最佳实践、模板引擎沙箱与配置中心热更新（按规范免冗余实验） |
| ✅ 多租户 Token 计量计费与软硬配额流控（2026-09-20 `ai-backend-21-multi-tenant-token-metering-finops`） | 按次计费在长文本下的破产困局、两阶段配额预扣与实时对账协议（Two-Phase Reservation）、Redis Lua 双轨原子滑动窗口（RPM + TPM 动态漏桶）、PostgreSQL 复式记账流水审计与软硬配额熔断 | 溯源 FinOps 框架规范、Stripe 预授权协议、Redis Lua 滑动窗口原子限流与 PostgreSQL 审计账本（按规范免冗余实验） |
| ✅ 单元测试与 CI/CD 大模型 Mock 与评测门禁（2026-09-20 `ai-backend-22-ci-cd-llm-testing-mocking-evaluation`） | 传统单测直连公有云 API 的三大毁灭性反模式（账单失控/Flaky 偶发失败/CI 断网隔离）、基于 VCR 磁带录制与 Fake Transport 的毫秒级本地单测、向量余弦相似度柔性断言与 GitHub Actions PR 质量门禁阻断 | 溯源 Fowler 2007 测试替身模式、VCR.py 规范、JSON Schema 契约校验与自动化黄金评测集（按规范免冗余实验） |

### S10. 前沿大模型训练与全栈 Infra 解密【万卡集群物理拓扑】

**为什么**：从单卡推理跨越到万卡分布式预训练与微调。吸收 NVIDIA Megatron-LM、DeepSpeed、Meta LLaMA-3 Infra 与 DeepSeek-V3 Infra 论文中的绝妙闪光点，由浅入深讲透并行切分、硬件通信重叠与超算调度。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| ✅ 3D 并行拓扑解密（2026-09-20 `llm-infra-01-3d-parallelism-megatron-deepspeed`） | 怎样把千亿模型切开放进万卡集群？张量并行（TP GEMM 横纵切分）、流水线并行（PP 1F1B 调度气泡消除）与数据并行（ZeRO/FSDP 分片对账） | 溯源 Shoeybi 2019 Megatron-LM 论文、Rajbhandari 2020 ZeRO 论文、NVLink 与 InfiniBand 3D 网格通信映射 |
| FlashAttention 1/2/3 硬件访存平铺 | 从数学 Softmax 到 GPU 硬件 SRAM/HBM 访存墙。Online Softmax 分块平铺算法如何将 O(N^2) 显存开销压缩至 O(N)，FP8 Tensor Core 异步拷贝指令（TMA）演进 | 溯源 Dao 2022/2023 FlashAttention 论文、Milakov 2018 Online Softmax 算法、GPU 内存层次与硬件指令微架构 |
| MoE 专家并行与通信隐藏 | 混合专家模型（MoE）路由门控机制、Token 丢弃（Token Drop）与负载不均雪崩、DeepSeek 无辅助损失负载均衡与 All-to-All 算网重叠架构 | 溯源 Shazeer 2017 MoE 论文、DeepSeek-V3 架构白皮书、双缓冲异步通信与重叠流水线 |

### S11. 现代内核、eBPF 与万兆高性能 I/O 破局【底层性能天花板】

**为什么**：打破传统后端应用与 Linux 操作系统的“黑盒隔离”。吸取 Brendan Gregg、Cloudflare 架构团队与 Linux 内核顶级维护者的实战精髓，直击单机千万级吞吐背后的内核原语。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| io_uring 的终极零拷贝哲学 | 终结 Linux 50 年 read/write 系统调用开销！提交队列（SQ）与完成队列（CQ）双无锁环形缓冲区、内核异步 Polling（IORING_SETUP_SQPOLL）压榨千万 IOPS | 溯源 Jens Axboe 2019 io_uring 内核白皮书、Epoll 系统调用上下文切换开销对比、纯用户态环形队列无锁并发 |
| XDP 与 eBPF 驱动层线速包处理 | 传统网络协议栈 sk_buff 内存分配的沉重代价。网卡驱动层（Driver Layer）零拷贝就地截获数据包，单机硬抗 100Gbps DDoS 洪峰与 L4 极速负载均衡 | 溯源 Hoeiland-Jorgensen 2018 XDP 论文、Linux 驱动层 ring buffer 内存模型与 eBPF JIT 字节码验证 |
| 内存黑洞：Transparent Huge Pages（THP）与内存紧缩卡顿 | 为什么 Redis/Postgres 官方强烈建议关闭 THP？2MB 大页跨区域分配触发 Direct Compaction 锁死 CPU 数百毫秒的内核机理与排查全链路 | 溯源 Linux 虚拟内存伙伴系统（Buddy System）、页迁移（Page Migration）与 vmstat 关键指标排障 |

### S12. 复杂系统重构与架构考古【资深架构演进破局】

**为什么**：现实业务从不是绿地开发（Greenfield），而是面对运行了 10 年、充满技术债务的庞大遗留系统。吸取 Martin Fowler、Shopify、Stripe 的真实重构艺术，打造不宕机平滑蜕变的架构底盘。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| 绞杀者模式（Strangler Fig）零停机重构实战 | 如何在十万 QPS 不停机的前提下，将庞大单体平滑替换为微服务？流量染色分流、CDC 增量双跑对账与一键瞬时回滚兜底防线 | 溯源 Martin Fowler 绞杀者模式规范、双写（Dual-Write）一致性状态机与灰度金丝雀流量网关 |
| Stripe 式不可变 API 版本演进网关 | 为什么对外 API 永远不能轻易破坏向下兼容？如何让 10 年前的客户端依旧正常调用，数据层无感双向转换的 AST 与门面网关（Gatekeeper）设计 | 溯源 Stripe API 版本演进白皮书、声明式字段转换管道与向后兼容性契约测试矩阵 |

### S13. 大模型信息安全与越狱红蓝对抗【生产级安全防护】

**为什么**：大模型把非确定性输入当成了执行代码，打开了前所未有的安全攻击面。吸收 OWASP Top 10 for LLMs、Anthropic Red Teaming 与前沿安全实验室的攻防精华。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| 提示词注入（Prompt Injection）物理本质与双模型隔离 | 为什么大模型天然分不清“指令”与“数据”？直接注入 vs 间接注入（通过网页/RAG），双 LLM 隔离（Dual LLM）与语义围栏架构 | 溯源 Simon Willison 提示词注入分析、OWASP LLM01 规范、沙箱隔离与内容安全过滤管道 |
| Token 走私与多模态对抗样本越狱防御 | 攻击者如何利用 Base64、ASCII 艺术字、Unicode 特殊字符或罕见 Token 绕过安全对齐？多层语义防火墙与输入归一化对抗防御工程 | 溯源 Wei 2023 Jailbroken 论文、Token 归一化清洗算法与 Llama Guard 安全分类器集成 |

### S14. 物联网与网络设备云平台架构实战【网络设备制造与云网协同】

**为什么**：专为网络设备制造（交换机、路由器、AP、CPE、防火墙）与物联网企业的后端工程师打造。直击带内管理、NAT 穿透、C10M 长连接、防变砖回滚与海量流式遥测的硬核云网协同底盘。

| 主题 | 核心问题 | 验证方式 |
| --- | --- | --- |
| ✅ 平台全景蓝图与南向协议选型（2026-09-20 `iot-netdev-01-architecture-blueprint-southbound-protocols`） | 网络设备管理平台五层架构、协议四十年对决（SNMP 轮询/CLI 正则刮削 vs NETCONF/YANG 事务 vs gNMI 流式遥测）、带内管理（In-Band）与设备影子（Device Shadow）异步状态机 | 溯源 RFC 6241 NETCONF、RFC 7950 YANG、OpenConfig gNMI 规范与 Desired/Reported 差异对账（按规范免冗余实验） |
| ✅ 百万长连接接入网关与心跳保活（2026-09-20 `iot-netdev-02-c10m-connection-gateway-keepalive`） | 单机百万物理长连接内核内存精算（256GB 压降至 16GB 的 tcp_rmem 调优）、运营商 CGNAT 120s 端口老化静默掉线、自适应心跳探顶与全抖动指数退避（Full Jitter）防惊群重连雪崩 | 溯源 UNIX 网络编程规范、AWS 全抖动退避数学推导、Linux 内核 Socket 内存模型与应用层心跳看门狗（按规范免冗余实验） |
| ✅ 配置事务与防变砖安全回滚（2026-09-20 `iot-netdev-03-atomic-config-rollback-commit-confirmed`） | 带内管理下改错配置自杀式失联变砖死穴、NETCONF RFC 6241 Commit-Confirmed 协议倒计时回滚状态机、设备本地三重健康探针自愈、云端网络拓扑感知编排（Leaf->Spine->Core） | 溯源 RFC 6241 确认提交规范、Cisco/Juniper 工业配置回滚实践、DAG 拓扑排序逆向推进流水线（按规范免冗余实验） |
| ✅ 海量网络遥测与时序分析流水线（2026-09-21 `iot-netdev-04-streaming-telemetry-tsdb-pipeline`） | 端口流量/丢包/光功率秒级高频流式上报、gNMI/HTTP2 多路复用、Kafka 动态分区与 ClickHouse/VictoriaMetrics 降采样聚合存储 | 溯源 gNMI 遥测协议规范、ClickHouse 稀疏时序索引与滑动窗口 CEP 告警状态机 |
| ✅ 穿透内网 NAT 的远程反向控制通道（2026-09-21 `iot-netdev-05-nat-traversal-reverse-shell-tunnel`） | 设备位于运营商私网无法反向建立连接、反向 SSH 隧道与 WebSocket 多路复用隧道（Yamux）、Web 终端（xterm.js）与高危命令拦截审计 | 溯源 RFC 4254 SSH 连接协议、STUN/TURN 穿透模型、浏览器端 ANSI 终端协议与 RBAC 权限网关 |
| ✅ 海量固件批量 OTA 升级与双分区容灾（2026-09-21 `iot-netdev-06-firmware-ota-ab-partition-rollback`） | 万台路由器批量固件推送、闪存 A/B 双分区（Active/Recovery）容灾、硬件看门狗崩溃自动切区启动、金丝雀灰度（1%->5%->100%）防全网瘫痪 | 溯源 Linux 嵌入式双系统启动规范（U-Boot）、分块校验断点续传与数字签名验签 |
| ✅ 增量配置同步与三路归并（2026-09-21 `iot-netdev-07-config-sync-incremental-reconciliation`） | 现场串口带外修改（Out-of-Band Drift）检测、RFC 8072 YANG Patch 树状差异算法、Base/Cloud/Local 三路归并冲突裁决与离线因果对账循环 | 溯源 RFC 8072 YANG Patch、RFC 7950 YANG 树建模、Git 三路归并原理与 K8s 控制器声明式调和状态机 |
| ✅ 设备影子与数字孪生内核架构（2026-09-21 `iot-netdev-08-device-shadow-desired-reported-state-machine`） | 期望态（Desired）与汇报态（Reported）异步双态机模型、单调递增版本号与乐观锁（OCC）并发控制、增量 Delta 动态提取与 Redis 内存原子更新 | 溯源 AWS IoT Device Shadow 架构、RFC 7396 JSON Merge Patch 规范、乐观离线锁模式与数字孪生状态对账 |
| ✅ 千万级分布式长连接集群治理（2026-09-21 `iot-netdev-09-distributed-connection-cluster-session-migration`） | 全局一致性哈希会话路由中心、网关滚动发布零断连无损热升级（Linux SCM_RIGHTS 文件描述符继承）、跨可用区异地多活容灾与重连风暴四级漏斗削峰 | 溯源 Linux unix(7) SCM_RIGHTS 内核套接字机制、NGINX/Envoy 热重启架构、分布式租约与客户端全抖动退避 |
| ✅ 零信任设备身份与通信安全底座（2026-09-21 `iot-netdev-10-zero-trust-device-identity-mtls-tpm`） | TPM 2.0 硬件安全芯片物理根信任（私钥永不出芯片）、海量设备 RFC 7030 EST 自动化证书签发与热轮换、双向 mTLS 强认证与应用层 ECDSA 指令签名防重放 | 溯源 TCG TPM 2.0 规范、RFC 7030 EST 证书注册、RFC 8446 TLS 1.3、NIST SP 800-193 平台韧性指南与防重放时间戳+Nonce |
| ✅ 零配置即插即用上线（ZTP）全流程（2026-07-14 `iot-netdev-11-ztp-zero-touch-provisioning-dhcp-option`） | 现场极简交付网线即通电、DHCP DORA 握手与 Option 66/67/82/43 解析、IEEE 802.1AR 硬件出厂安全芯片证书（IDevID）向厂商全球 Redirect Server 安全报到与企业专属私有云重定向 | 溯源 RFC 2131 DHCP、RFC 2132 DHCP Options、RFC 8572 Secure ZTP 规范、IEEE 802.1AR 出厂设备凭证与动态签名防劫持引导脚本（按规范免冗余实验） |
| ✅ 跨厂商网络配置建模与 YANG / OpenConfig 数据树引擎（2026-07-15 `iot-netdev-12-yang-openconfig-unified-data-modeling`） | 终结 CLI 字符串拼装与厂商专有方言孤岛、RFC 7950 YANG 数据建模语言核心语义（container/list/leaf/choice/must）、OpenConfig 行业中立标准数据树、抽象语法树（AST）校验与多厂商目标代码生成 | 溯源 RFC 7950 YANG 规范、RFC 6020、Google/行业联盟 OpenConfig 标准架构、AST 双向编译与模式驱动自动化（按规范免冗余实验） |
| ✅ 全网物理拓扑自动发现与链路状态图引擎（2026-07-16 `iot-netdev-13-lldp-network-topology-graph-engine`） | 数据链路层保留组播 MAC `01:80:c2:00:00:0e` 逐跳物理隔离机制、IEEE 802.1AB LLDP TLV 解析、二层端口与设备双层图数据模型、以太聚合（LACP）链路折叠与光纤熔断 BFS 爆炸半径扩散推演 | 溯源 IEEE 802.1AB LLDP 规范、RFC 2863 IF-MIB、网络拓扑图算法与广度优先搜索故障爆炸半径推演（按规范免冗余实验） |
| ✅ 意图驱动网络（IBN）与 Batfish 静态形式化验证（2026-07-17 `iot-netdev-14-intent-based-networking-batfish-validation`） | 网络分布式协议强耦合变更事故防范、声明式意图（Intent）模型、Batfish 控制面形式化仿真与 BDD 符号执行算法、全网可达性/无环路/单链路熔断/多租户隔离四大断言门禁 | 溯源 Fogel 2015 NSDI Batfish 论文、SMT 约束求解器、RFC 7950、Cisco IBN 白皮书与生产级 NetDevOps CI/CD 自动化阻断流水线（按规范免冗余实验） |
| ✅ 毫秒级流级遥测（Flow Telemetry）与微突发拥塞诊断（2026-07-18 `iot-netdev-15-flow-telemetry-microburst-monitoring`） | 秒级监控拉平效应盲区、交换机片上包缓存（MMU）微突发（Microburst / Incast）0.8ms 耗尽物理精算、IPFIX 动态模板机制与二进制解耦、Linux recvmmsg 批量系统调用与 Kafka+ClickHouse 稀疏列存全景 | 溯源 RFC 7011/7012 IPFIX 规范、RFC 3176 sFlow 规范、ACM SIGCOMM 微突发论文、Broadcom ASIC MMU 架构与纳秒滑动窗口突发检测引擎（按规范免冗余实验） |

---

## 开发顺序建议

1. **S1 先开**（补地基，锂不依赖外部资源，随时可写）
2. **S2 随时插入**（钩子已埋，最适合"今天定不下来写什么"时的替补）
3. **S3/S4 交替**（面试硬货，面向跳槽前 1-2 个月的强化期）
4. **S5/S6 见缝插针**（差异化与省力,篇幅可短）

规则：每写一篇，本文档对应行打 ✅ 并注明日期；新系列开写前先在 AGENTS.md 更新"进行中"。