---
title: 面试官：如何设计高可用分布式键值（KV）存储系统？（从 Amazon Dynamo 论文、LSM-Tree 物理读写放大到 Quorum NWR 与 Merkle 树反熵修复）
description: 深度拆解支撑海量高并发读写的分布式键值（Key-Value）存储系统架构（参考 Alex Xu 系统设计精要第 6 章及 Amazon Dynamo、Apache Cassandra、RocksDB 真实工业演进）：剖析从 B+ 树向 LSM-Tree 跨越的存储引擎物理本质；推导 MemTable 内存跳表、SSTable 分层压缩（Compaction）与布隆过滤器（Bloom Filter）消除读放大的第一性原理；深入探讨 Quorum 模型（W+R>N）在并发重叠写下的边界弱点；推导向量时钟（Vector Clock）因果冲突检测，并系统性构建读修复（Read Repair）、提示移交（Hinted Handoff）与 Merkle 树反熵同步的自愈闭环。
publishedAt: 2026-05-05
tags: ["系统设计", "面试题", "分布式存储", "KV存储", "Dynamo", "LSM-Tree", "Quorum", "向量时钟", "Merkle树"]
category: 面试深度拆解
draft: false
featured: false
---

**TL;DR：** 分布式键值存储（Distributed Key-Value Store，如 Amazon DynamoDB、Apache Cassandra、ScyllaDB、RocksDB）是现代互联网与云计算基础设施的基石。在 Staff/Principal 级面试中，面试官绝不满足于“哈希表 + 一致性哈希环”这种浅层框架，而是会深挖单机存储介质物理特性与分布式理论交互的五大深水区硬核命题：**第一，为什么在超高吞吐写入场景下，B+ 树因随机写与页分裂被彻底淘汰，而 LSM-Tree（Log-Structured Merge-Tree）是如何通过不可变追加与分层压缩（Compaction）换取极致写吞吐的？读取时的“读放大（Read Amplification）”与布隆过滤器（Bloom Filter）的数学过滤边界又是什么？**；**第二，很多候选人以为满足 Quorum 强一致性公式 $W + R > N$ 就万事大吉，为什么在并发重叠写入（Concurrent Writes）和网络分区时，系统依然会发生脏读甚至因果倒错？**；**第三，为什么简单的物理时钟覆盖（Last-Write-Wins, LWW）会在 NTP 毫秒级偏斜下导致静默数据丢失，向量时钟（Vector Clock）是如何通过分量偏序比较实现精确因果冲突捕获的？**；以及**第四，长周期节点离线导致大量数据漂移后，两个节点之间如何在不全量传输数百 GB 数据的物理网络限制下，依靠 Merkle 树（哈希树）以 $\mathcal{O}(\log N)$ 的极小网络带宽精准揪出差异记录？**

---

## 1. 面试考点还原：从单机存储引擎到分布式去中心化

在顶尖大厂的分布式存储与基础设施面试中，面试官往往会从单机底层逐步上升到分布式全景：

> **面试官提问：**  
> “设计一个支撑 1,000 万写入 QPS、单表存储 PB 级数据的去中心化高可用分布式键值存储系统（类似 Amazon Dynamo / Cassandra）。  
> 1. **存储引擎物理抉择**：单机存储为什么不能用 MySQL 默认的 B+ 树，而必须选用 LSM-Tree？请画出 LSM-Tree 写入（WAL、MemTable、SSTable）与读取的全过程。在读取冷数据时，LSM-Tree 面临严重的‘读放大’，系统是如何利用布隆过滤器将磁盘寻道开销降低 99% 的？  
> 2. **SSTable 压缩风暴**：SSTable 在磁盘上是不可变的，随着更新和删除积累，后台必须执行 Compaction。Size-Tiered 与 Leveled Compaction 各自的物理权衡是什么？写放大系数（WAF）对 NVMe SSD 寿命和系统带宽会带来什么冲击？  
> 3. **Quorum 机制的假象**：我们配置副本数 $N=3$，写入副本数 $W=2$，读取副本数 $R=2$。数学上 $W + R = 4 > 3$。既然读写的副本集必有交集，这是否意味着系统满足严格线性一致性（Linearizability）？在什么极端场景下依然会读到旧值？  
> 4. **冲突解决与数据自愈**：当节点网络分区恢复后，我们发现不同副本上针对同一个 Key 存在不同版本。如何避免物理时钟回拨导致的数据被错误覆盖？集群如何在日常运行中利用**读修复（Read Repair）、提示移交（Hinted Handoff）与 Merkle 树反熵对齐（Anti-Entropy）**构建三层自愈防线？”

---

## 2. 发展脉络与开山之作：2007 年 Amazon Dynamo 论文的革命

在 2007 年之前，数据库界长期被关系型数据库（Oracle、MySQL）和严格的 ACID / 2PC 强一致性模型统治。然而，面对亚马逊“黑色星期五”海量订单导致的数据库锁死与高可用崩溃，Amazon 工程师打破了传统范式。

2007 年，Giuseppe DeCandia 等人在 SOSP 上发表了划时代的奠基论文：
> **Giuseppe DeCandia et al.** *"Dynamo: Amazon's Highly Available Key-value Store."* ACM SIGOPS Operating Systems Review (SOSP 2007).

这篇论文正式确立了 **AP 系统（高可用、分区容忍性、最终一致性）** 的工业实现范式：
- **无主对称架构（Leaderless Peer-to-Peer）**：集群中所有节点角色完全对等，没有单点 Master，任何节点都能作为请求协调者（Coordinator）。
- **写永远优先（Always Writable）**：对于电商购物车，哪怕发生网络分区，系统宁可接受数据冲突，也绝不拒绝对用户的写操作。
- **冲突推迟至读取时解决**：写入时只记录因果版本，读取时再将冲突暴露给上层应用（或通过算法收敛）。

---

## 3. 单机存储引擎底层：B+ 树 vs LSM-Tree 的物理对决

系统设计的第一步是确定**单机节点上的数据持久化引擎**。

```
[B+ 树 (原地随机写) vs LSM-Tree (日志追加写) 物理对比]

B+ 树 (In-Place Update 随机 I/O):
写数据: UPDATE user SET age = 30 WHERE id = 10086;
  |
  +---> 1. 磁盘随机寻道 定位到包含 id=10086 的 16KB 数据页
  +---> 2. 内存修改该数据页
  +---> 3. 将整页 16KB 刷回物理扇区 (哪怕只改了 4 字节!)
  +---> 4. 产生严重的随机写 I/O 与写放大 (WAF > 10)

LSM-Tree (Append-Only 顺序 I/O):
写数据: PUT user:10086 { age: 30 }
  |
  +---> 1. 顺序追加写入磁盘 WAL 日志 (Commit Log, 仅顺序 I/O)
  +---> 2. 写入内存跳表 (MemTable, 内存操作, 0 磁盘寻道)
  +---> 3. 立即向客户端返回成功！
  +---> 4. 后台批次将 MemTable 顺序刷盘为不可变文件 (SSTable)
```

### 3.1 为什么高吞吐写入必须淘汰 B+ 树？
- **机械臂与 SSD 页写物理限制**：机械硬盘的随机 IOPS 仅为 100~200；而固态硬盘（SSD）即使没有机械臂，随机写也会触发物理擦除块（Block Erase）的垃圾回收（GC），引发写放大与延迟抖动。
- B+ 树的“就地更新（In-place Update）”强制要求每次更新都必须精确改写底层的对应 Page，写入吞吐受限于硬件的随机写瓶颈。
- **LSM-Tree 的破局**：将**所有写操作转化为纯粹的磁盘顺序追加写（Sequential Append）**。无论 Insert、Update 还是 Delete，在底层全部作为一条不可变的新增记录写入，顺序写吞吐可达物理介质上限（数百 MB/s 至数 GB/s）。

---

### 3.2 LSM-Tree 核心三板斧：MemTable、SSTable 与 Bloom Filter

```
[LSM-Tree 完整读写链路拓扑]

【写入路径 (Write Path)】
Client Write ---> [ WAL (磁盘顺序日志) ] ---> [ 内存 MemTable (跳表 SkipList) ] ---> 返回成功！
                                                       |
                                        (达到阈值, 如 64MB)
                                                       v
                                            [ Immutable MemTable ]
                                                       | (后台 Flush 线程顺序写盘)
                                                       v
                                            [ L0 SSTables (磁盘文件) ]
                                                       | (Compaction 整理)
                                                       v
                                            [ L1, L2, L3 SSTables ]

【读取路径 (Read Path)】
Client Read ---> 1. 查活跃 MemTable (内存) ---> 命中直接返回！
                 2. 查只读 Immutable MemTable (内存)
                 3. 遍历各层 SSTable (磁盘):
                    +---> 先查 Bloom Filter (纯内存)
                            |-- 判定“一定不存在” -> 0 磁盘 I/O，直接跳过!
                            +-- 判定“可能存在”   -> 二分查找 SSTable 稀疏索引 -> 读磁盘数据块
```

#### 1. 写入缓冲：MemTable 与 WAL
- 数据首先追加写入磁盘上的预写日志（Write-Ahead Log, WAL），保证机器断电时数据不丢失。
- 随后写入内存中的 **MemTable**（通常使用**跳表 SkipList** 或**红黑树**实现，保证内存中数据按 Key 全序有序）。
- 当 MemTable 大小达到阈值（如 64MB），它会被冻结为只读的 **Immutable MemTable**，系统分配一个全新的活跃 MemTable 继续接客。
- 后台独立的 Flush 线程将 Immutable MemTable 逐层以**连续大块**的形式顺序刷入物理磁盘，生成第 0 层的 **SSTable（Sorted String Table）** 文件。

#### 2. 磁盘文件：SSTable（有序字符串表）
- SSTable 文件内部完全**按 Key 字典序紧凑排序**，并被划分为若干个 4KB~64KB 的数据块（Block）。
- 文件末尾包含一个**稀疏索引（Sparse Index）**，记录每个 Block 的第一个 Key 及其在文件中的物理偏移量。查找某个 Key 时，只需在内存索引中二分查找定位到目标 Block，再拉取该 Block 即可。

#### 3. 消除读放大：布隆过滤器（Bloom Filter）
- **物理读放大的困境**：由于同一个 Key 可能在不同的 SSTable 中被多次更新，读取一个 Key 时，系统可能需要自上而下从 L0 到 Ln 扫描数十个 SSTable 文件。如果 Key 根本不存在，系统甚至需要把全部 SSTable 翻个遍才能确认，导致单次读请求耗费数十次磁盘 I/O！
- **布隆过滤器拯救读性能**：系统为每个 SSTable 在内存中维护一个对应的 **布隆过滤器（Bloom Filter）**。
  - 布隆过滤器的数学铁律：**若判定为不存在，则该 SSTable 必定绝对不存在目标 Key！**
  - 读取时，如果 Bloom Filter 返回 `false`，系统直接跳过该 SSTable，**产生 0 次磁盘寻道**。仅当返回 `true` 时才发起磁盘 I/O。这直接消除了 **99% 以上的无用磁盘读取**。

---

### 3.3 SSTable 压缩（Compaction）两大战法

随着数据不断写入，磁盘上的 SSTable 会急剧膨胀，且包含大量已被删除（打上墓碑标记 Tombstone）或旧版本的废弃数据。系统必须在后台执行**压缩合并（Compaction）**。

| 压缩策略 | Size-Tiered Compaction (STCS - Cassandra 默认) | Leveled Compaction (LCS - RocksDB / LevelDB 默认) |
| :--- | :--- | :--- |
| **核心机制** | 当同一层级内积累了若干个（如 4 个）大小相似的 SSTable 时，合并成上一层一个更大的 SSTable。 | 磁盘划分为固定的层级（L0, L1, L2...）。每层总容量指数增长（如 10MB, 100MB, 1GB）。**L1 及以上层级内的各个 SSTable 的 Key 范围互不重叠**！ |
| **写放大 (WAF)** | 较低（合并频率较低，节省写入带宽与 SSD 寿命）。 | 较高（跨层合并频繁，同一个 Key 会被反复读取写盘多次）。 |
| **读放大 (RAF)** | 较高（同一层级可能有重叠 Key，需检查多个文件）。 | **极低（每层最多只需读取一个 SSTable，点查极快）**。 |
| **空间放大 (SAF)** | 极严重（合并时需要预留高达 **50% 的空闲磁盘空间** 作为临时缓冲）。 | **极低（额外磁盘空间仅需 10% 左右）**。 |
| **适用场景** | 高频写入、日志记录、追加写为主的时序场景。 | **读多写少、读写均衡、对点查延迟要求极高的高价值 KV 业务**。 |

---

## 4. 分布式去中心化与 Quorum 模型深水区

在解决单机引擎后，我们进入分布式副本拓扑。

### 4.1 一致性哈希环与虚拟节点（Consistent Hash Ring with V-Nodes）

Dynamo 将整个哈希空间（例如 $0 \sim 2^{32}-1$ 或 $0 \sim 2^{128}-1$）抽象为一个闭合圆环：
- **虚拟节点（Virtual Nodes）**：为了防止物理机器性能不均引发数据倾斜，单台物理节点被映射为圆环上的 $V$ 个（如 128 或 256 个）虚拟节点。
- **喜好列表（Preference List）**：对于任意一个 Key，其哈希值落入圆环后，顺时针方向遇到的**前 $N$ 个属于不同物理主机的节点**，组成该 Key 的副本集（Replication Group）。

---

### 4.2 Quorum 机制（$W + R > N$）及其不可逾越的边界

在 Dynamo 模型中，数据一致性由三个参数配置：
- $N$：数据副本总数（通常设为 3）。
- $W$：写入操作必须获得 ACK 的最少副本数（例如设为 2）。
- $R$：读取操作必须读取的最少副本数（例如设为 2）。

```
[Quorum NWR 模型的鸽巢原理重叠]

总副本数 N = 3 (节点 A, 节点 B, 节点 C)
写入集 (W = 2): 写入并确认落入 [ 节点 A, 节点 B ]
读取集 (R = 2): 客户端随机读取 [ 节点 B, 节点 C ]
                             |
                             v
               【交集节点 (Overlapping Node)】: 节点 B!
               由于 W + R = 4 > 3，根据鸽巢原理，
               读取集与写入集必定至少存在一个重叠节点 (节点 B)！
               客户端只要比对重叠节点的版本号，就能拿到最新的数据！
```

#### 面试绝杀追问：$W + R > N$ 为什么依然不保证线性强一致性？

很多候选人把 $W + R > N$ 等同于强一致性，面试官会立刻追问：**“在什么真实物理并发场景下，即使满足 $W+R>N$，客户端依然会读到旧值？”**

```
[并发重叠写击穿 Quorum 一致性过程]

物理节点: Node 1, Node 2, Node 3 (N=3, W=2, R=2)
初始值: Key 的值为 V0

时刻 T1: 客户端 A 发起写请求: 将 Key 写入 V1
         - 成功写入 Node 1 (版本更新为 V1)
         - 正在向 Node 2 发送网络请求 (网络突然发生抖动延迟...)

时刻 T2 (并发交错发生!): 客户端 B 发起读取请求 (R=2):
         - 读取请求随机命中了 Node 2 和 Node 3！
         - 此时 Node 2 尚未收到 V1，返回旧值 V0！
         - Node 3 也从未收到 V1，返回旧值 V0！
         - 客户端 B 判定结果为 V0 并成功返回！

时刻 T3: 客户端 A 对 Node 2 的网络写入终于到达，Node 2 变为 V1。
         客户端 A 收到 Node 1 和 Node 2 的 ACK，写操作完成！

【真相】：在 T2 时刻，一个已经在物理上发生并部分落盘的写入，完全无法被读取端观察到！
由于没有全局两阶段提交锁或一致性定序器，并发交叉读写必然导致短暂的因果倒错与弱一致读！
```

---

## 5. 冲突解决：物理时钟 LWW 之死与向量时钟（Vector Clock）

当网络发生分区，节点 A 与节点 B 各自接收到了来自不同客户端针对同一个 Key 的修改，两个版本在该 Key 的偏好列表中分道扬镳。系统如何捕获并解决这一冲突？

### 5.1 物理时钟（Last-Write-Wins, LWW）的致命陷阱

Apache Cassandra 默认采用 **LWW（最后写入胜出）**：每条写入附带本地机器的微秒级 Wall Clock 时间戳，时间戳大的覆盖时间戳小的。

**为什么 LWW 在金融/核心业务中是灾难性的？**
- 假设节点 1 的物理时钟由于 NTP 漂移比真实世界**快了 200 毫秒**。
- 用户在节点 1 写入了 `status = "UNPAID"`，时间戳被打上 `10:00:00.200`。
- 100 毫秒后（真实世界 10:00:00.100），用户在时钟正常的节点 2 付款成功，写入 `status = "PAID"`，时间戳被打上 `10:00:00.100`。
- **悲剧发生**：LWW 比较两个时间戳，赫然判定 `10:00:00.200`（未支付）胜出，系统无情地将用户已经付款的状态**静默覆盖回未支付**！产生无法追溯的严重资金差错。

---

### 5.2 向量时钟（Vector Clock）的数学因果判定

Amazon Dynamo 提出了采用**向量时钟（Vector Clock）**来捕获更新事件之间的因果先后关系（Causal History）。

向量时钟是一个由 `(节点标识, 计数器)` 构成的元组列表：

$$VC = \{ (S_1, c_1), (S_2, c_2), \dots, (S_n, c_n) \}$$

```
[向量时钟捕捉并发分叉与冲突全景]

1. 客户端写入初始数据 D1:
   由节点 A 处理，向量时钟: VC1 = { (A, 1) }

2. 客户端读取 D1，在此基础上修改为 D2:
   仍由节点 A 处理，向量时钟推进: VC2 = { (A, 2) }
   (因为对于所有分量 VC2 >= VC1 且存在大于项，系统自动判定 VC2 继承并覆盖 VC1)
                /                                    \
               /                                      \ (发生网络分区或并发异步写入!)
              v                                        v
3. 客户端 X 在节点 B 修改为 D3:           4. 客户端 Y 在节点 C 修改为 D4:
   时钟变为: VC3 = { (A, 2), (B, 1) }       时钟变为: VC4 = { (A, 2), (C, 1) }
              \                                        /
               \------------------+-------------------/
                                  |
                                  v
5. 客户端 Z 发起读取请求 (读到 D3 和 D4):
   比对向量时钟 VC3 与 VC4:
   - VC3 中 B 的计数大 (1 > 0)
   - VC4 中 C 的计数大 (1 > 0)
   - 互不包含！系统判定：【发生并发因果冲突 (Concurrent Divergence)!】
   - 系统将 D3 和 D4 同时返回给客户端应用层，由业务逻辑合并（如购物车合并商品集合），
     合并后写入 D5，时钟归一收敛为: VC5 = { (A, 2), (B, 1), (C, 1), (A, 3) } !
```

---

## 6. 数据自愈机制：读修复、提示移交与 Merkle 树反熵对齐

为了保证最终一致性，系统内部必须运转三套自动化自愈齿轮：

```
[三层数据自愈防线]

第一道防线 (毫秒级实时自愈): 读修复 (Read Repair)
- 客户端发起 R=2 读取，比对各副本版本。
- 若发现 Node A 是最新版本，Node B 是老版本，协调者在向客户端返回最新数据的同时，
  在后台异步向 Node B 发送写请求，补齐最新版本！

第二道防线 (秒级/分钟级临时故障): 提示移交 (Hinted Handoff)
- 目标写入节点 Node C 临时网络超时不可达。
- 协调者将该数据暂存本地一个特殊的“提示桶 (Hints)”中。
- 协调者通过 Gossip 协议周期性探测 Node C；一旦 Node C 重新上线，
  立即将 Hints 补发给 Node C，恢复其副本完整性。

第三道防线 (小时级/离线兜底): Merkle 树反熵修复 (Anti-Entropy with Merkle Trees)
- 面对长时间离线、崩溃后换盘重装的严重落后节点。
- 节点之间在后台定期比对 Merkle 树，以极小网络开销精准定位并同步差异。
```

---

### 6.1 Merkle 树（哈希树）反熵同步的物理与算法细节

如果两个节点存储了 100 GB 的数据（数亿个 Key），它们如何确定彼此之间到底有哪些 Key 不一致？
- **愚蠢方案**：全量传输 100GB 数据比对，或者全量传输所有 Key 的哈希列表（数 GB 内存与带宽），网络瞬间瘫痪。
- **Merkle 树的代数魔法**：

```
[Merkle Tree 树状哈希比对定位差异]

                    [ Root Hash: H(1234) ]  (两节点比对根哈希，若相同则数据 100% 一致!)
                           /       \
                          /         \
            [ Hash: H(12) ]         [ Hash: H(34) ]  <-- 发现不同！只下钻右子树！
               /        \               /        \
         [ H(1) ]     [ H(2) ]    [ H(3) ]     [ H(4) ]  <-- 最终锁定只有数据块 4 不一致！
            |            |           |            |
         Key A        Key B       Key C        Key D
```

1. 每个节点为自己负责的特定哈希区间（Token Range）在本地磁盘构建一棵二叉 **Merkle 树**。
2. 树的叶子节点是具体 Key-Value 范围的哈希值，父节点是其两个子节点哈希值的拼接散列：
   $$\text{Parent} = \text{Hash}(\text{LeftChild} + \text{RightChild})$$
3. **比对协议**：
   - 两个节点首先只交换 **Root Hash（根哈希，仅 32 字节！）**。如果 Root Hash 相同，说明两者数据完全一致，同步结束（网络开销为 0）。
   - 如果 Root Hash 不同，双方递归索取并比对下一层的子节点哈希。
   - 算法沿着哈希不同的分支逐层下钻，仅需比对 $\mathcal{O}(\log N)$ 次网络往返，就能在千万级数据集中**精准揪出那几个发生漂移的叶子数据块**，仅物理传输这几个数据块进行补齐。

---

## 7. 方案对比矩阵：分布式键值存储系统选型

| 架构维度 | Amazon Dynamo / Apache Cassandra | Google Bigtable / HBase | Redis Cluster | etcd / Consul |
| :--- | :--- | :--- | :--- | :--- |
| **一致性模型** | **弱一致性 / 最终一致 (AP / Quorum)** | **强一致性 (CP / 单 Master 多 Region)** | 弱一致（异步主从复制） | **严格线性强一致 (CP / Raft)** |
| **单机存储引擎** | **LSM-Tree (MemTable + SSTable)** | **LSM-Tree (MemTable + HFiles)** | 纯内存哈希表 + RDB/AOF | B+ 树 (bbolt) + Raft WAL |
| **拓扑架构** | **完全对等无主 (P2P Leaderless)** | 主从架构 (Master + RegionServers) | 多主分片 + 哨兵故障转移 | 强 Leader 仲裁集群 (奇数节点) |
| **并发写入吞吐** | **极高（LSM-Tree 顺序追加，无锁）** | 极高（同左，但受 Master 元数据协调）| **超高（单核内存几十万 QPS）** | 较低（几千 QPS，受 Raft 强同步约束） |
| **冲突处理方式** | **向量时钟 (Vector Clock) / LWW** | 单行版本时间戳覆盖 (MVCC) | 简单内存覆盖 | 不允许冲突（Raft 严格全序共识） |
| **数据自愈机制** | **Read Repair + Hints + Merkle 树** | 依赖 HDFS 多副本自动重构 | 手工全量重同步或增量复制 | 节点落后通过 Raft Snapshot 追赶 |
| **典型适用场景** | 电商购物车、用户 Profile、物联网时序数据 | 海量稀疏表格、搜索引擎反向索引 | 高速缓存、全局计数器、会话状态 | 分布式锁、服务发现、配置中心元数据 |

---

## 8. 总结：系统设计面试交付范式

在回答“分布式键值存储系统设计”时，高段位候选人应当展现出坚实的软硬件协同功底：

1. **从存储介质的第一性原理立论**：
   - 明确指出 B+ 树原地写与页分裂在海量写入下的物理破产，深入阐明 **LSM-Tree 通过不可变追加写将随机 I/O 转化为顺序 I/O** 的物理真谛，并用**布隆过滤器压制 99% 的读放大**。
2. **客观解构分布式共识模型**：
   - 不迷信 $W + R > N$ 公式，深入剖析并发重叠写击穿 Quorum 的边界场景；
   - 揭露 LWW 在 NTP 时钟偏斜下的静默覆写灾难，给出**向量时钟因果图**展现对分布式版本分叉的掌控力。
3. **展现自愈架构的工业级成熟度**：
   - 给出**“读修复实时收敛、提示移交拦截瞬态抖动、Merkle 树反熵对齐修复长期离线”**的三级自愈体系，尤其讲透 Merkle 树以 $\mathcal{O}(\log N)$ 网络带宽定位差异的算法细节，完成架构闭环。

---

## 参考资料与规范出处

1. **Giuseppe DeCandia, Deniz Hastorun, Madan Jampani, et al.** (2007). *Dynamo: Amazon's Highly Available Key-value Store.* ACM SIGOPS Operating Systems Review (SOSP 2007), 41(6), 205–220.
2. **Patrick O'Neil, Edward O'Neil, Gerhard Weikum.** (1996). *The Log-Structured Merge-Tree (LSM-tree).* Acta Informatica, 33(4), 351–385.
3. **Fay Chang, Jeffrey Dean, Sanjay Ghemawat, et al.** (2006). *Bigtable: A Distributed Storage System for Structured Data.* USENIX OSDI 2006.
4. **Apache Cassandra 官方架构文档.** *Architecture: Dynamo and Bigtable Heritage.* `https://cassandra.apache.org/doc/latest/cassandra/architecture/`
5. **Alex Xu.** (2020). *System Design Interview – An Insider's Guide (Volume 1), Chapter 6: Design a Key-Value Store.*
