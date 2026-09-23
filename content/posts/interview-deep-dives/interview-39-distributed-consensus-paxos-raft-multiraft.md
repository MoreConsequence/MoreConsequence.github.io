---
title: "分布式共识协议的工业演进：从 Paxos 不可言说的悲剧到 Raft 与 Multi-Raft 分区拓扑"
description: "深度拆解分布式系统核心基石共识算法（Consensus Algorithms）的理论演进与工业落地。从 Leslie Lamport 兼职国会经典论文 Basic/Multi-Paxos 在工程落地中的断层与“无法言说的复杂性”（Paxos Made Live），到 Ongaro 2014 奠基的 Raft 状态机拆解、随机化选举与日志安全性证明；深入剖析 ReadIndex 线性一致性读与 Lease Read 优化，解构 TiKV/CockroachDB 千万级 Region 下的 Multi-Raft 分区拓扑、心跳风暴抑制与动态分裂合并。"
publishedAt: "2026-05-25"
series: "资深工程师面试深度拆解"
tags: ["系统设计", "面试题", "分布式共识", "Raft", "Paxos", "Multi-Raft", "NewSQL"]
category: "面试深度拆解"
draft: false
featured: false
---

**TL;DR：** 分布式共识算法是构建强一致性存储（etcd、Consul、TiKV、CockroachDB、Spanner）的灵魂中枢。它解决了在异步不可靠网络中，一组节点如何就操作序列达成不可篡改的一致性。然而，从图灵奖得主 Leslie Lamport 1998 年提出宛如希腊寓言般晦涩的 **Paxos**，到 Google 在实践中历经数年才写出工业级实现的《Paxos Made Live》，理论与现实之间横亘着巨大的鸿沟。斯坦福大学 Diego Ongaro 提出的 **Raft** 算法通过将共识解耦为**领导选举、日志复制与安全性不变量**，彻底重构了工业界共识技术栈；而在面向百 TB 乃至 PB 级分布式 NewSQL 数据库时，单一 Raft 集群遭遇物理瓶颈，演化为支撑千万级 Region 并发切片的 **Multi-Raft 架构**。本文深入推导 Paxos 到 Raft 的数学收敛过程、剖析 ReadIndex 线性一致性读的零磁盘 I/O 机制，并解构 Multi-Raft 的心跳风暴抑制与分裂状态机。

---

## 一、共识问题的物理本质：复制状态机模型（RSM）

### 1.1 复制状态机（Replicated State Machine）

在分布式系统中，保证多台服务器状态一致的标准理论范式是**复制状态机（RSM）**：

$$\text{Deterministic State Machine} + \text{Replicated Ordered Log} = \text{Fault-Tolerant Distributed System}$$

```
Client Write Request
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                 Distributed Consensus Module (Raft / Paxos) │
│  Consensus: 将操作按严格全序追加到各个节点的 Write-Ahead Log │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ 提交确认 (Committed Log Entry)
┌─────────────────────────────────────────────────────────────┐
│                 Deterministic State Machine (KV Store)      │
│  State: 相同的初始状态 + 相同的有序日志 = 100% 确定同态终态  │
└─────────────────────────────────────────────────────────────┘
```

- **确定性状态机（Deterministic State Machine）**：给定相同的初始状态和完全相同顺序的输入日志序列，状态机必定产生完全相同的内部状态与输出；
- **共识模块（Consensus Engine）**：其唯一职责就是**确保所有节点上的 Write-Ahead Log（WAL）按完全相同的顺序包含完全相同的日志条目**。
- **容错定理（Fault-Tolerance Bound）**：
  在一个由 $2F + 1$ 个节点构成的共识集群中，系统最多能够容忍 **$F$ 个节点发生崩溃或网络失联**，且依然能够保持系统的安全性（Safety，绝无冲突或双写）与活性（Liveness，系统能继续处理请求）。

---

## 二、经典 Paxos 的悲剧：理论完美与工业断层

### 2.1 Basic Paxos 的二阶段两轮交互

Leslie Lamport 于 1998 年在《The Part-Time Parliament》中提出了 Paxos，后于 2001 年发表《Paxos Made Simple》进行简化。
Basic Paxos 解决的是：**分布式节点如何就“单一值（Single Value）”达成一致**。

```
Proposer (提案者)                                Acceptors (接受者多数派 Quorum)
     │                                                        │
     │─── Phase 1a: PREPARE(n) (提案号 n 严格单调自增) ──────>│
     │                                                        │ 检查：若 n > 之前见过的所有编号
     │<── Phase 1b: PROMISE(n, max_accepted_v, max_n) ────────│ 承诺：不再接受 < n 的任何提案，
     │                                                        │ 并返回此前已接受过的最大值
     │                                                        │
     │ (若收集到多数派 Promise)                                │
     │ (选择返回中提案号最大的值作为 v；若为空则用自己的值)     │
     │                                                        │
     │─── Phase 2a: ACCEPT(n, v) ────────────────────────────>│
     │                                                        │ 检查：若未违背此前更高编号的承诺
     │<── Phase 2b: ACCEPTED ─────────────────────────────────│ 正式接受该值 v
```

### 2.2 工业落地的致命“断层”：Paxos Made Live

2007 年，Google 在 PODC 会议发表了著名的《Paxos Made Live - An Engineering Perspective》，坦承在 Chubby 锁服务中落地 Multi-Paxos 时遭遇了无法想象的工程炼狱：

1. **活锁问题（Livelock / Dueling Proposers）**：
   若两个提案者 Proposer A 和 Proposer B 交替发出编号不断递增的 `Prepare` 请求（$n_1 < n_2 < n_3 \dots$），每个提案者的 Phase 1 都会使对方的 Phase 2 提案失效，导致系统**在无限的二阶段抢占中陷入死循环，长时间无法达成任何共识**！
2. **理论与工程的巨大脱节**：
   Lamport 的论文仅仅证明了“单值共识”。但真实的工业系统需要的是连续不断追加的日志流（Multi-Paxos）。
   论文中对以下生产级关键命题**只字未提**：
   - 成员动态扩容与缩容（Configuration Change）；
   - 日志垃圾回收与快照压缩（Log Compaction & Snapshotting）；
   - 磁盘硬件故障坏道与静默数据损坏的自愈机制；
   - 乱序日志的缺洞修补（Log Holes Patching）。
   这导致在 2014 年之前，全球只有少数具备顶级数学家与系统工程师的团队（Google、微软）能够手写一套能跑通的 Multi-Paxos 实现，且代码充满隐晦的边缘特判。

---

## 三、Raft 革命：可理解性与强主状态机拆解

为了终结 Paxos 的理解与实现灾难，斯坦福大学的 Diego Ongaro 与 John Ousterhout 于 2014 年发表了划时代论文《In Search of an Understandable Consensus Algorithm》。
Raft 的核心设计哲学是：**将复杂的共识问题，严格解耦为三个独立且自闭环的子问题**：

```
                              Raft 分布式共识三大核心支柱
                                           │
          ┌────────────────────────────────┼────────────────────────────────┐
          ▼                                ▼                                ▼
【子问题一：领导选举】             【子问题二：日志复制】             【子问题三：安全性不变量】
(Leader Election)                 (Log Replication)                 (Safety Invariants)
随机化超时时钟 (150~300ms)        Leader 顺序追加 WAL，             Leader 完整性定理：
杜绝选票瓜分，心跳保活主权。       通过多数派 Quorum 推动 Commit。  包含全部已提交日志才能当选 Leader！
```

### 3.1 领导选举（Leader Election）与随机化防瓜分

Raft 确立了**强领导者（Strong Leader）**模型：所有的客户端读写请求必须汇聚到 Leader，由 Leader 单向驱动 Followers。

#### 节点状态机转换：
- 节点处于三种状态之一：`Follower`、`Candidate`、`Leader`；
- 每个节点维护一个单调递增的逻辑周期编号：**任期（Term）**。

```
                    心跳超时，发起投票 (Increment Term)
         ┌────────────────────────────────────────────────────────┐
         │                                                        │
         ▼                                                        │
┌──────────────────┐           获得多数派赞成票             ┌──────────────────┐
│    Candidate     │ ────────────────────────────────────> │      Leader      │
│  (候选竞选者)    │                                       │   (权威主节点)   │
└──────────────────┘ <──────────────────────────────────── └──────────────────┘
         ▲                     发现更高 Term 或新 Leader          │
         │                                                        │
         │                 超时未收到 Heartbeat                   │
         └──────────────── ┌──────────────────┐ <─────────────────┘
                           │     Follower     │
                           │    (从属节点)    │
                           └──────────────────┘
```

#### 随机化选举超时（Randomized Election Timeout）：
为防止多个 Follower 同时超时并发起竞选导致**选票瓜分（Split Vote）**，Raft 规定每个节点的选举超时时间从一个离散区间（如 $150\text{ ms}\sim 300\text{ ms}$）中**随机生成**。
率先超时的节点首先将自身 `Term = Term + 1`，向全网广播 `RequestVote`。其他节点在收到投票请求时，每个 Term 只能投出一票（先到先得），保证单轮选举通常能在毫秒级快速决出单一胜出者。

### 3.2 日志复制与一致性匹配检查（Log Matching Invariant）

```
Leader Log:    [ Index 1, T1 ] [ Index 2, T1 ] [ Index 3, T2 ] [ Index 4, T2 ] (Commit=3)
                      │               │               │               │
                      ▼ AppendEntries RPC (prevLogIndex=3, prevLogTerm=2)
Follower Log:  [ Index 1, T1 ] [ Index 2, T1 ] [ Index 3, T2 ] [ Index 4, T2 ] (OK!)
```

#### 日志匹配不变量（Log Matching Property）：
- 如果不同节点的日志中，有两处日志条目的 `(index, term)` 相同，则它们必定包含相同的状态机指令；
- 如果不同节点的日志在某个 `(index, term)` 相同，则它们**此前所有的历史日志条目必定严格完全相同**！

#### 修复分叉日志：
当发生网络分区后重新连通，Follower 节点可能滞后、或者残留了未提交的脏日志：
- Leader 针对每个 Follower 维护一个 `nextIndex`（下一个要发送的日志索引）；
- 若 Follower 在 `AppendEntries` 中返回失败（表示 `prevLogIndex` 处的 term 不匹配），Leader 将该 Follower 的 `nextIndex` 递减 1，并再次重试；
- 循环递减直至找到双方一致的点，随后 Leader **强制用自己的日志覆盖 Follower 后续的所有冲突条目**！

### 3.3 安全性核心：Leader 完整性定理（Leader Completeness）

在面试中，关于 Raft 最核心的理论拷问是：**“如果一个节点宕机期间错过了多条已经 Commit 的日志，它重新上线后有没有可能通过发起选举抢占成为 Leader，进而把之前已经提交的数据覆盖掉？”**

#### 答案是：绝不可能！
Raft 在**选举阶段（RequestVote）设置了严苛的拒绝断言**：
每个投票者在决定是否给 Candidate 投票时，必须比对双方的日志新鲜度：
1. 若 Candidate 的最后一条日志的 Term 小于投票者的最后一条日志 Term，**拒绝投票**；
2. 若两者最后一条日志的 Term 相同，但 Candidate 的日志长度（Last Log Index）小于投票者，**拒绝投票**！

$$\text{Candidate Is Up-to-Date} \iff (\text{Term}_{cand} > \text{Term}_{voter}) \lor (\text{Term}_{cand} == \text{Term}_{voter} \land \text{Index}_{cand} \ge \text{Index}_{voter})$$

**数学保证**：任何一条已经被多数派确认并 Commit 的日志，必然已经存在于集群的至少 $\lceil N/2 \rceil + 1$ 个节点上。因此，任何想要赢得多数派选票的新 Leader，其日志集合中**必然已经包含了全量已提交的日志条目**，从而从形式化证明上确立了已提交日志的绝对不可篡改性！

---

## 四、读性能的极致突破：ReadIndex 与 Lease Read

在标准的 Raft 逻辑中，读取数据也必须作为一条日志在全集群执行一次 `AppendEntries` 并在多数派确认后才能读取，这导致只读请求也面临磁盘 I/O 与网络往返，吞吐极低。
初学者常想：“只读请求直接由 Leader 读取本地内存不就行了吗？”
**这是致命的脑裂脏读陷阱！**

### 4.1 幽灵 Leader 与网络分区脑裂（Phantom Leader）

```
                  [ Network Partition Barrier ]
                  
     Partition A (少数派)              Partition B (多数派)
  ┌────────────────────────┐        ┌────────────────────────┐
  │ Node 1 (Old Leader!)   │        │ Node 2 (New Leader!)   │
  │ (不知道自己已被隔离)     │        │ Node 3                 │
  └────────────────────────┘        └────────────────────────┘
```
- Node 1 处于少数派网络分区，但由于尚未收到心跳超时，它依然自认为自己是合法的 Leader；
- 多数派分区已经成功选出了 Node 2 作为新 Leader，并提交了最新的写操作（如余额扣减至 0）；
- 此时若客户端向 Node 1 发起读取请求，若 Node 1 直接读本地内存，将读到旧的陈旧脏数据，**线性一致性（Linearizability）彻底破产！**

### 4.2 工业级解法：ReadIndex 协议（零磁盘 I/O）

ReadIndex 允许 Leader 不向磁盘写入任何 Raft 日志，以纯内存网络探测确认权威性：

```
Client Read Request
        │
        ▼
[ Current Leader (Node 1) ]
        │
        ├── ① 记录当前本地已提交的最大索引: readIndex = commitIndex
        │
        ├── ② 向集群所有节点发送轻量级 Heartbeat 探测
        │   └── 收集多数派 Quorum ACK (确认自己依然是合法的权威 Leader!)
        │
        ├── ③ 等待本地状态机的 applyIndex 追赶推进至 >= readIndex
        │   └── 保证当前状态机已经完整回放了该时刻之前的所有已提交修改
        │
        ▼ ④ 直接读取本地内存状态机，返回给客户端！
(全程零磁盘落盘 I/O，延迟由 20ms 骤降至网络单次 RTT < 1ms!)
```

### 4.3 极限优化：Lease Read（基于物理时钟租约）

如果连向多数派发 Heartbeat 的单次网络 RTT 都不想等待，系统可进一步升级为 **Lease Read**：
- Leader 每次成功向多数派发送一次心跳后，获得一个微小的时钟租约（例如 $200\text{ ms}$）；
- 规定 Follower 在租约时间内**绝不发起新一轮选举**；
- 在租约期内，Leader 可以 $100\%$ 确信自己绝不可能被推翻，从而**无需任何网络交互，直接就地读取内存状态机**！
- **物理前提约束**：必须依赖服务器物理时钟漂移有界（Bounded Clock Drift），若发生极端的 NTP 阶跃跳变，存在微小的陈旧读风险。

---

## 五、百 TB 级突破：Multi-Raft 分区切片架构

单个 Raft 集群无论如何调优，其物理上限只能达到几台物理机、数万 QPS。当面对分布式关系型数据库（如 TiDB / TiKV、CockroachDB）高达 **数十 TB 乃至 PB 级数据、百万级写 QPS** 时，单一 Raft 集群宣告彻底失效：
- 单一 Leader 成为全集群所有写入的带宽与 CPU 绝对瓶颈；
- 单个节点无法容纳全量海量数据，必须进行水平数据分片。

### 5.1 Multi-Raft 核心架构拓扑

Multi-Raft 将全局线性的 Key-Value 空间，划分为成千上万个连续的、大小固定的逻辑切片（在 TiKV 中称为 **Region**，默认大小为 $96\text{ MB}$）。
**每一个 Region 独立组成一个拥有 3 个副本的 Raft 共识小集群！**

```
Physical Server 1                Physical Server 2                Physical Server 3
┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│ [ Region 1 (Leader) ]│ ──────> │ [ Region 1 (Follower)│ ──────> │ [ Region 1 (Follower)│
│                      │         │                      │         │                      │
│ [ Region 2 (Follower)│ <────── │ [ Region 2 (Leader) ]│ ──────> │ [ Region 2 (Follower)│
│                      │         │                      │         │                      │
│ [ Region 3 (Follower)│ <────── │ [ Region 3 (Follower)│ <────── │ [ Region 3 (Leader) ]│
└──────────────────────┘         └──────────────────────┘         └──────────────────────┘
```

#### 物理优势：
1. **全集群 Leader 均匀打散**：
   每台物理服务器上同时运行着数千个不同 Region 的副本。有的 Region 它是 Leader，有的 Region 它是 Follower。全集群的读写热点被均匀摊销到所有物理机上，消除单点瓶颈；
2. **海量 Region 并发提交**：
   针对不同 Region 的写操作，各自在其独立的 Raft Group 内部并发达成多数派共识，不同分片之间互不干扰，写入吞吐实现近乎无限的**线性水平横向扩展（Scale-out）**。

### 5.2 核心挑战一：千万级 Region 的心跳风暴与静默抑制

在 Multi-Raft 架构下，若单机托管了 20,000 个 Region，每个 Region 默认每隔 $100\text{ ms}$ 发送一次心跳：
- 单台物理机每秒需要处理：$20,000 \times 10 = \mathbf{200,000 \text{ 次心跳 RPC}}$！
- 巨额的心跳报文会瞬间吞噬内网带宽，并将 CPU 耗尽在空虚的序列化与调度上。

#### 工业级自愈方案：静默与合并机制（Batching & Quiescence）
1. **多 Region 报文批量打包（Multi-Raft Message Coalescing）**：
   在底层网络传输层，同一个物理节点发往另一个物理节点的所有不同 Region 的心跳，在 $10\text{ ms}$ 的时间窗内被自动合并为一个单次 TCP 报文发送；
2. **空闲静默感知（Raft Group Quiescence）**：
   对于长时间没有写入流量的“冷数据 Region”，Leader 会主动降低心跳频率甚至进入休眠（Quiescence）。直到该 Region 发生新的写请求时，再瞬间唤醒并推进状态机。

### 5.3 核心挑战二：动态分裂与合并状态机（Region Split & Merge）

当某个 Region 的数据量因频繁写入超过阈值（如达到 $144\text{ MB}$）时，系统必须将其原子性切分为两个 $72\text{ MB}$ 的新 Region。
分裂过程本身如何防止分布式脑裂？

```
                Original Region 1: Key Range [ "a", "z" )
                                   │
                                   ▼ Split Proposal (SplitKey = "m")
┌───────────────────────────────────────────────────────────────────────────┐
│              Raft Log Entry: { type: SPLIT, split_key: "m" }              │
│  (分裂指令作为一个普通的 Raft 日志在 Region 1 内部发起共识复制)             │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │
                                   ▼ 多数派确认并 Apply
┌──────────────────────────────────┴────────────────────────────────────────┐
│                        Atomic State Machine Mutation                      │
│  Region 1: 缩容修改边界为 [ "a", "m" )                                     │
│  Region 2: 原地衍生全新 Raft 组，边界为 [ "m", "z" )                       │
└───────────────────────────────────────────────────────────────────────────┘
```

- **共识内部闭环**：
  分裂操作被封装为一个标准的 `SplitAdminCmd` 写入 Raft 日志。只有当多数派节点均复制了该分裂日志并在状态机中执行应用（Apply）时，旧 Region 的边界才原子缩小，新 Region 继承数据并开始独立承载调度。
- 彻底规避了外部第三方协调者强行改动元数据引发的数据覆盖与空洞风险。

---

## 六、面试高频追问与 Staff 级应答策略

### Q1：在 Raft 中，为什么 Leader 不能直接根据多数派确认，来提交上一任期（Previous Term）的日志？
> **深度回答**：
> 1. **经典的图 8 覆盖陷阱（Raft Paper Figure 8）**：
>    如果允许 Leader 通过单纯计数多数派来提交旧 Term 的条目，在遭遇极端网络分区与多轮换主的情况下，一个已经被多数派复制但未包含在最新任期内的旧日志，可能会被另一个更新的、拥有更高 Term 但不包含该日志的 Candidate 在当选后强行覆盖；
> 2. **Raft 强制规则：只有当前 Term 的日志被复制到多数派，才能连带提交旧日志**：
>    Leader 当选后，**绝不允许直接对旧 Term 的日志推进 Commit**！Leader 必须在当前 Term 至少生成并成功将一条属于当前 Term 的新日志（或空日志 No-Op）提交至多数派。由这条当前 Term 日志的提交，**间接、连带地将此前所有的历史日志一并原子性安全提交**。

### Q2：Raft 集群在执行动态扩容缩容（配置变更，如 3 节点变 5 节点）时，为什么单步变更（Single-Server Change）可以生效，而必须严禁一次性修改多个节点？
> **深度回答**：
> 1. **多节点直接替换的双多数派脑裂（Overlapping Quorums）**：
>    若将配置从 $C_{old} = \{1, 2, 3\}$ 直接一步切换到 $C_{new} = \{1, 2, 3, 4, 5\}$。由于网络传播延迟，节点 1 和 2 可能仍然处于旧配置视角（旧多数派只需 2 票），而节点 3、4、5 已经切换到新配置视角（新多数派需 3 票）。在同一瞬间，可能同时出现两个合法的多数派分别选出不同的 Leader，导致严重脑裂！
> 2. **单步变更的数学不变式**：
>    每次只增加或删除一个节点（$N \to N+1$ 或 $N \to N-1$）。在数学上，任意包含奇数个节点的配置，单步变更后的两个集群的任意多数派集合，**其交集必然至少包含一个重叠节点**，从代数上彻底抹杀了双多数派的存在可能；
> 3. **联合共识（Joint Consensus）**：
>    若必须一次性替换多个节点（如整机房搬迁），必须使用两阶段联合共识：进入中间态 $C_{old,new}$，此时所有决议必须同时获得 $C_{old}$ 的多数派 AND $C_{new}$ 的多数派的**双重批准**，方可平滑过渡。

### Q3：ZooKeeper 使用的 ZAB 协议与 Raft 有何异同？为什么 ZooKeeper 无法直接替代 Raft 成为现代 NewSQL 的内核？
> **深度回答**：
> 1. **核心逻辑同构**：ZAB（ZooKeeper Atomic Broadcast）与 Raft 同样基于强主模型、两阶段广播与基于纪元编号（Epoch / Term）的状态恢复；
> 2. **关键机制差异**：
>    - **主从关系模式**：ZAB 的广播更偏向于主备复制（Primary-Backup），而 Raft 将选主、日志匹配与安全性约束在单一的日志流结构内形式化自闭环；
>    - **数据规模定位**：ZooKeeper 设计初衷是作为分布式协调中心，其全量元数据必须完全驻留在物理内存中，单节点数据量通常限制在数 GB 以内，无法支持大规模磁盘分片；
> 3. **Multi-Raft 的超越**：现代 NewSQL（如 TiKV）需要的是数万个独立并行的轻量级共识状态机实例（Multi-Raft）。ZooKeeper 单一庞大的系统架构根本无法在单机虚拟化出成千上万个轻量集群切片。

---

## 七、总结与分布式共识算法工业级对照表

从 Paxos 的晦涩艰深到 Multi-Raft 的千万级切片并发，分布式共识算法的演进见证了系统软件从“学术象牙塔”走向“工业工程落地”的宏伟历程：

| 算法 / 架构 | 领导者模式 | 核心设计哲学 | 工业级优势与突破 | 局限与适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **Basic Paxos** | 无固定主（多主并发提议） | 二阶段共识，协商单一孤立值 | 数学理论坚固，容错模型形式化严谨 | 活锁（Livelock）频发，无法直接用于流式日志，难以工程落地 |
| **Multi-Paxos** | 稳定主（Amortized Leader） | 将 Phase 1 摊销到多条连续日志流 | 理论上最高效（1 次 RTT 提交） | 异常边界、成员变更极度复杂晦涩（如 Chubby、Spanner 专有实现） |
| **Raft** | 强主复制（Strong Leader） | 解耦为选主、复制与安全性，可理解性第一 | 状态机清晰，ReadIndex 零磁盘开销，已成为现代开源共识统一标准 | 单集群写入吞吐存在物理瓶颈（通常受限于数万 QPS），无法单集群承载百 TB 数据 |
| **Multi-Raft** | 动态海量多主（Multi-Group） | 数据按连续 Range 切片，每个 Region 独立 Raft 组 | 突破单机与单主物理极限，支持千万级分片并发写入与毫秒级在线分裂合并 | 架构实现复杂度极高，必须设计专门的心跳风暴抑制与 Region 调度平衡器 |

---

## 参考资料与规范出处

- **Leslie Lamport** (ACM Transactions on Computer Systems, 1998) - *The Part-Time Parliament (The Original Paxos Paper)*.
- **Leslie Lamport** (ACM SIGACT News, 2001) - *Paxos Made Simple*.
- **Tushar D. Chandra et al.** (Google Research, PODC 2007) - *Paxos Made Live - An Engineering Perspective*.
- **Diego Ongaro & John Ousterhout** (Stanford University, USENIX ATC 2014) - *In Search of an Understandable Consensus Algorithm (Raft)*.
- **PingCAP TiKV Engineering Guide** - *Deep Dive into Multi-Raft Architecture and Region Balancing*.
