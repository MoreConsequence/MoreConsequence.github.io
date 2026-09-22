---
title: "实时多人协同文档系统架构：从操作转换（OT）到 CRDT 数学收敛与因果树"
description: "深度拆解百万级并发实时协同编辑系统的底层架构演进。从 Ellis & Gibbs 1989 开山之作操作转换（Operational Transformation, OT）与 Jupiter 中心化定序器模型，到 Marc Shapiro 2011 奠基的无冲突复制数据类型（CRDT）半格数学收敛证明，深入剖析字符位置标识空间分裂、Yjs/Automerge 块级游程压缩与富文本并发撤销重做（Undo/Redo）的工业级实现。"
publishedAt: "2026-05-15"
tags: ["系统设计", "面试题", "协同文档", "CRDT", "OT算法", "分布式一致性"]
category: "面试深度拆解"
draft: false
featured: false
---

**TL;DR：** 实时多人在线协同文档（如 Google Docs、Notion、Figma、飞书文档）是分布式一致性算法在富客户端场景下的终极挑战。在非对称网络延迟与离线编辑的背景下，数位用户在无全局锁的情况下并发修改同一段文本，必然产生因果错乱与内容分叉。本文从操作转换（OT）的经典矩阵变换切入，剖析其对中心化服务器（Jupiter 架构）的物理依赖与 TP2 状态爆炸困境；推导基于半格（Semilattice）数学公理的 CRDT（无冲突复制数据类型）如何实现任意拓扑下的强最终一致性（SEC）；解构现代 CRDT（Yjs / Automerge）如何通过双向链表与游程编码（RLE）打破早期“一个字符 100 字节内存”的物理壁垒；最后落地具备房间状态机、信标光标同步与协同 Undo/Redo 的生产级全景架构。

---

## 一、并发冲突的物理困境与一致性模型

### 1.1 并发编辑的形式化冲突

设初始文档内容为字符串：`"CAT"`。
用户 Alice 与用户 Bob 在同一毫秒内对文档发起并发修改：
- **Alice 的意图**：在索引 1 处插入字符 `'H'`（希望将 `"CAT"` 变为 `"CHAT"`），生成操作：
  $$O_A = \text{Insert}(1, \text{'H'})$$
- **Bob 的意图**：在索引 3 处插入字符 `'S'`（希望将 `"CAT"` 变为 `"CATS"`），生成操作：
  $$O_B = \text{Insert}(3, \text{'S'})$$

```
                        Initial State: "CAT"
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       Alice (Local Apply):             Bob (Local Apply):
       Insert(1, 'H') -> "CHAT"         Insert(3, 'S') -> "CATS"
                 │                               │
                 │ (Network Delay)               │ (Network Delay)
                 ▼                               ▼
       Alice receives O_B               Bob receives O_A
       Insert(3, 'S')                   Insert(1, 'H')
                 │                               │
                 ▼                               ▼
       "CHA" + 'S' + "T"                "C" + 'H' + "ATS"
       Result: "CHAST"                  Result: "CHATS"
                 ▲                               ▲
                 └─────────── DIVERGENCE! ───────┘
                     (两端内容发生不可逆永久分叉)
```

#### 分叉的根本原因：
传统的基于偏移量（Index-based）的操作在空间上具有**上下文依赖性（Context-sensitive）**。Alice 在其本地应用 $O_A$ 后，字符串长度变为 4，原本由 Bob 基于旧视图计算出的偏移量 $3$ 在 Alice 的新视图中已经失效！

### 1.2 协同系统的一致性黄金三原则（CCI Model）

根据分布式协同经典理论，一个强壮的多人协作系统必须满足：
1. **收敛性（Convergence）**：当所有副本接收到相同的并发操作集合后，所有客户端展示的文档内容必须严格同态一致；
2. **因果性（Causality Preservation）**：若操作 $O_1$ 先于 $O_2$ 发生（$O_1 \to O_2$），则在所有副本上 $O_1$ 必须在 $O_2$ 之前被执行；
3. **用户意图保全（Intention Preservation）**：操作执行后的语义效果必须与用户在本地输入时的直观期望保持一致（例如 Alice 想要插在 C 后面，最终字符 H 绝不能跳到 A 后面）。

---

## 二、第一代工业标准：操作转换（Operational Transformation, OT）

为了在保持纯文本轻量存储的前提下解决并发偏移量漂移，Ellis 与 Gibbs 于 1989 年在 SIGMOD 会议提出了**操作转换（OT）**。Google Docs、Etherpad 均以此为基石。

### 2.1 OT 转换函数的核心数学定义

OT 的核心思想是：**操作不直接应用，而是根据并发接收到的其他操作进行上下文平移修正**。
定义转换函数 $T$：输入两个基于同一状态生成的并发操作 $O_A$ 与 $O_B$，输出修正后的操作 $O_A'$ 与 $O_B'$：
$$\langle O_A', O_B' \rangle = T(O_A, O_B)$$

对于简单的字符插入操作，其转换逻辑形式化如下：
```python
def transform_insert(op_a, op_b):
    # op_a: Insert(pos_a, char_a)
    # op_b: Insert(pos_b, char_b)
    if op_a.pos < op_b.pos:
        # a 在 b 左侧，b 的插入不影响 a 的偏移量
        return Insert(op_a.pos, op_a.char), Insert(op_b.pos + 1, op_b.char)
    elif op_a.pos > op_b.pos:
        # a 在 b 右侧，由于 b 插入了一个字符，a 的偏移量必须向右平移 1 位
        return Insert(op_a.pos + 1, op_a.char), Insert(op_b.pos, op_b.char)
    else:
        # 相同位置冲突，通过全局唯一的客户端 ClientID 破偶（Tie-Breaking）
        if op_a.client_id < op_b.client_id:
            return Insert(op_a.pos, op_a.char), Insert(op_b.pos + 1, op_b.char)
        else:
            return Insert(op_a.pos + 1, op_a.char), Insert(op_b.pos, op_b.char)
```

在上一节的冲突中：
- Alice 收到 Bob 的 $O_B = \text{Insert}(3, \text{'S'})$，通过 $T(O_B, O_A)$ 转换，由于 $3 > 1$，修正为 $O_B' = \text{Insert}(4, \text{'S'})$；
- Alice 执行 $O_B'$：在 `"CHAT"` 的索引 4 插入 `'S'`，得到 `"CHATS"`；
- Bob 收到 Alice 的 $O_A = \text{Insert}(1, \text{'H'})$，通过 $T(O_A, O_B)$ 转换，由于 $1 < 3$，修正为 $O_A' = \text{Insert}(1, \text{'H'})$；
- Bob 执行 $O_A'$：在 `"CATS"` 的索引 1 插入 `'H'`，得到 `"CHATS"`！
- **两端成功收敛！**

### 2.2 OT 的阿喀琉斯之踵：TP2 困境与中心化 Jupiter 架构

OT 算法看似美妙，但学术界在后续 20 年的研究中发现：在 P2P 去中心化网络下，当出现 3 个或更多用户并发编辑时，操作转换必须满足**转换属性 2（Transformation Property 2, TP2）**：

$$T(O_1, O_2 \circ T(O_3, O_2)) \equiv T(O_1, O_3 \circ T(O_2, O_3))$$

数学界证明，对于包含文本删除、加粗、格式化等丰富操作集，**设计出完全满足 TP2 的纯对等 OT 算法几乎是不可能的**（学术界发表的数十篇声称证明了 TP2 的论文，后续几乎全部被同行构造出反例证伪）。

#### 工业妥协：Xerox PARC Jupiter 中心化定序器模型
为了规避不可解的 TP2 困境，Google Docs 和现代商业 OT 系统全面退守到 **Jupiter 中心化星型拓扑**：

```
                    [ Centralized Sequencer Server (Jupiter) ]
                    ├── Global Operation Log: [Rev 0, Rev 1, Rev 2, ...]
                    └── Single Source of Truth
                                     ▲
                     ┌───────────────┴───────────────┐
                     │ (WebSocket Dual-Stream)       │
                     ▼                               ▼
            [ Client 1 (Alice) ]            [ Client 2 (Bob) ]
            ├── Local Buffer                ├── Local Buffer
            └── Server Revision Clock       └── Server Revision Clock
```

1. **绝对主序（Global Total Order）**：所有客户端的操作必须发送给唯一的中央服务器；
2. **中心定序**：服务器维护一个自增的版本号（Revision Number）。对于任意并发操作，服务器先到先服务，给每个操作分配单调递增的权威版本号；
3. **客户端状态缓冲（Client State Machine）**：客户端本地维护三种状态：
   - `Synchronized`（本地无未确认修改）；
   - `AwaitingConfirm`（本地提交了一个操作，正在等待服务端 ACK，期间产生的新操作进入队列）；
   - `AwaitingWithBuffer`（本地有一个操作在等 ACK，本地又有连续输入在本地 Buffer 中累积）。
4. **致命代价**：
   - **强依赖中心服务端**：无网或离线环境下，客户端无法进行多人 P2P 协作；
   - **离线合并复杂度极高**：某人断网 3 小时编辑了上万字，重新联网时，客户端与服务端之间需要针对成千上万个操作执行高阶多维矩阵 Rebase 变换，极易引发计算卡死甚至算法边界崩溃。

---

## 三、新一代工业革命：无冲突复制数据类型（CRDT）

为了彻底摆脱对中心服务器的单点依赖，支持原生离线编辑（Local-First Software）与点对点去中心化协作，Marc Shapiro 等人于 2011 年形式化提出了 **CRDT（Conflict-free Replicated Data Types）**。Figma、Notion、Apple Notes 以及现代协作框架（Yjs、Automerge）全面倒向 CRDT。

### 3.1 CRDT 的数学底座：偏序集与半格（Join-Semilattice）

CRDT 的核心公理是：**如果所有的并发操作构成一个满足数学交换律、结合律与幂等性的半格结构，那么无论数据在网络中以何种乱序、重复甚至网络分区的方式同步，系统状态最终必然收敛到一个唯一的最小上界（Least Upper Bound, LUB）！**

$$\text{Join-Semilattice} = \langle S, \sqcup \rangle$$

- **交换律（Commutativity）**：$x \sqcup y = y \sqcup x$（接收顺序无关）；
- **结合律（Associativity）**：$(x \sqcup y) \sqcup z = x \sqcup (y \sqcup z)$（消息批次合并无关）；
- **幂等性（Idempotence）**：$x \sqcup x = x$（重复投递、网络重试无副作用）。

```
               Unique Upper Bound (Final State)
                           x ⊔ y
                          ▲     ▲
                         /       \
                        /         \
                 State x           State y
                  (Alice)           (Bob)
                        \         /
                         \       /
                          ▼     ▼
                    Base State (Root)
```

**数学保证**：只要网络满足最终可达性，副本之间无需任何锁、无需中心化协调器、无需 Paxos/Raft 选举，状态直接按位或合并即可天然达到**强最终一致性（Strong Eventual Consistency, SEC）**！

### 3.2 序列 CRDT 的核心：分数索引与不可变唯一 ID

CRDT 解决文本协同的关键洞察是：**彻底废黜相对偏移量（Index），为文本中的每一个字符分配一个全局唯一、绝对不可变的位序标识（Fractional Position Identifier）！**

无论文档如何修改，已经存在的字符的 ID 永远保持恒定；新插入的字符不再说“插在第 3 个位置”，而是说“**插在字符 ID 为 A 和字符 ID 为 B 之间的逻辑空间**”。

#### 分数索引（Fractional Indexing）空间分裂模型：
假设开头为 $0$，结尾为 $1$：
- 初始文本：在开头和结尾之间插入 `"A"`，其位置为 $0.5$；
- Alice 在 `"A"` 后面追加 `"B"`，其位置设为 $0.5$ 与 $1.0$ 的中点：$0.75$；
- Bob 在 `"A"` 与 `"B"` 之间插入 `"C"`，其位置设为 $0.5$ 与 $0.75$ 的中点：$0.625$。

```
Logical Position Axis:
0.0                                0.5            0.625         0.75                       1.0
 ├──────────────────────────────────┼───────────────┼─────────────┼─────────────────────────┤
[START]                            "A"             "C"           "B"                       [END]
```

由于实数空间是连续且无限稠密的（Dense Space），在任意两个已存在的坐标之间，数学上永远能够插入新的连续小数！
排序规则极其简单：**所有副本只需将所有接收到的字符按其位置坐标进行单调递增排序，文本内容自然同态收敛！**

### 3.3 浮点数精度耗尽与结构体 ID（Lamport Timestamp + ClientID）

计算机底层 IEEE 754 浮点数仅有 53 位有效尾数。如果在两个字符之间连续插入 100 次，浮点数会发生精度下溢崩溃。
因此，工业级 CRDT（如 Logoot、LSeq、YATA）采用**可变长整数数组**作为逻辑坐标，结合 Lamport 逻辑时钟与客户端唯一 ID：

$$\text{Character ID} = \langle \text{PosVector}, \text{LamportTimestamp}, \text{ClientID} \rangle$$

例如：
- 字符 `'A'` 的 ID：$\langle [1], 10, \text{Alice} \rangle$
- 字符 `'B'` 的 ID：$\langle [2], 12, \text{Bob} \rangle$
- 在 `'A'` 和 `'B'` 之间插入字符 `'X'`：$\langle [1, 5], 13, \text{Alice} \rangle$
- 如果两端并发在同一坐标插入，则比较第二优先级的 `LamportTimestamp`，若依然相同，则比较第三优先级的 `ClientID` 字符串字典序。
- **全序比较（Total Order）严格确立，绝无歧义！**

---

## 四、工业级性能蜕变：Yjs / Automerge 如何压榨百万字符内存

早期的学术级 CRDT 原型（如 WOOT、Treedoc）在工业界遭遇了惨烈失败，被称为“内存粉碎机”。
- **学术原型的物理灾难**：文本中每个单字符都是一个独立的堆内存对象，携带坐标数组、时钟、左右指针与元数据。原本 1MB 的纯文本（约 100 万字），在内存中膨胀到了 **100MB ~ 200MB**，且带来数百万个细碎对象引发的 JVM/V8 GC 频繁卡顿。
- **现代工程救赎：Yjs（Kevin Jahns）与 Automerge 2.0（Martin Kleppmann）**。

```
Naive Academic CRDT:
[ Node: char='H', id=(1, 10, A), left_ptr, right_ptr ]  --> 120 Bytes
[ Node: char='e', id=(1, 11, A), left_ptr, right_ptr ]  --> 120 Bytes
[ Node: char='l', id=(1, 12, A), left_ptr, right_ptr ]  --> 120 Bytes
(100 万字符占用 120MB 内存)

Modern Industrial Yjs (Block-level Run-Length Encoding):
┌─────────────────────────────────────────────────────────────┐
│ Item Block:                                                 │
│   id: (1, 10, Client_A)                                     │
│   length: 5                                                 │
│   content: "Hello" (连续字符串)                             │
│   origin_left: Node_X, origin_right: Node_Y                 │
└─────────────────────────────────────────────────────────────┘
(利用连续打字局部性，将 5 个字符折叠为 1 个内存对象，开销降至 1.5 倍！)
```

### 4.1 块级游程编码（Chunking & Run-Length Encoding, RLE）

在真实用户打字场景中，99% 的击键都是同一个用户在光标处连续键入一系列字符（例如一口气敲出单词 `"architecture"`）。
现代 CRDT 不再以“单字符”为最小原子，而是采用**块结构（Item Block）**：
- 记录首字符的 ID `(Client, Clock)`，以及该块包含的连续内容长度 `Length`；
- 该块内后续字符的逻辑时钟隐式递增（`Clock + offset`）；
- **分裂与合并（Split & Merge）**：只有当其他用户并发将新字符精确插入到该块的正中间时，系统才在惰性状态下将该块动态分裂为两个小块。
- **收益**：内存对象数量骤降 **$95\%$ 以上**，100 万字文档的内存开销压缩至仅需数 MB，与原生字符串几乎无异！

### 4.2 结构化不可变双向链表（YATA 算法）

Yjs 核心采用 YATA（Yet Another Transformation Approach）无冲突复制算法，文档在内部被组织为一个由 Item 构成的**逻辑双向链表**。
- 每个 Item 记录其诞生时依赖的左邻居（`origin_left`）与右邻居（`origin_right`）；
- 当两个副本并发插入具有相同左右邻居的两个块时，通过确立的数学规则（比较 ClientID 规则与起源边穿越规则）无歧义地决定插入顺序；
- **字符删除采用墓碑机制（Tombstone）**：删除一个字符并不直接从链表中物理 `free` 该节点，而是将其打上 `deleted: true` 墓碑标记，保留其 ID 与位序占位。当所有副本确认该删除后，在后台进行垃圾回收（GC Compaction）。

---

## 五、富文本协同与分布式 Undo/Redo

多人协同不仅要处理纯文本，还要支撑加粗、下划线、超链接等富文本属性，以及各自独立的撤销重做。

### 5.1 富文本格式区间的并发冲突：Peritext 算法

若文本为 `"hello world"`：
- Alice 并发将 `"hello"` 设为加粗（Bold）；
- Bob 并发在 `"hello"` 后面输入 `" beautiful"`。
- **冲突焦点**：新插入的 `" beautiful"` 到底应不应该带有 Bold 格式？
- 现代协同规范（如 Martin Kleppmann 提出的 **Peritext 模型**）将格式标记抽象为**内联格式锚点（Formatting Spans）**，明确区分格式控制的左边界与右边界是“开放扩展（Expanding）”还是“封闭截断（Contracting）”，并在 CRDT 属性树上进行因果消解。

### 5.2 协同环境下的 Undo/Redo：选择性逆操作（Selective Undo）

在多人协同下，标准的栈式 Undo（简单的 `Ctrl+Z` 弹出上一个状态）是绝对灾难！
**场景**：
1. Alice 键入了 `"Hello "`；
2. Bob 键入了 `"World"`；
3. Alice 按下 `Ctrl+Z`。
- **错误行为**：如果简单撤回文档末尾的最新操作，Alice 的 Undo 会把 Bob 刚刚输入的 `"World"` 删掉！
- **正确行为（Selective Undo）**：Alice 的 Undo **必须且只能撤销 Alice 本人曾经引入的修改，同时绝对不能破坏 Bob 的并发输入！**

```
Alice Operation History: [ Op_A1: Insert("Hello") ]
Bob Operation History:   [ Op_B1: Insert("World") ]
                              │
                              ▼ Alice presses Ctrl + Z
Generate Selective Undo Action:
1. 在 Alice 本地历史栈中定位到 Op_A1;
2. 构造逆向补偿操作（Inverse Operation）: Delete(Op_A1 的字符精确 ID 集合);
3. 将该 Delete 操作作为一个全新的 CRDT 操作广播给全网;
4. Bob 的 "World" 字符坐标未受任何物理篡改，完整得以保全！
```

---

## 六、端到端系统架构全景与协同拓扑

```
[ Browser / Native App (Client A) ]               [ Browser / Native App (Client B) ]
├── Editor UI (ProseMirror / Slate)               ├── Editor UI
├── CRDT Document State (Yjs Y.Doc)               ├── CRDT Document State (Yjs Y.Doc)
├── Local UndoManager (Per-User Scope)            ├── Local UndoManager
└── WebSocket Client (Binary Protobuf)            └── WebSocket Client
            │                                                 │
            └────────────────────────┬────────────────────────┘
                                     ▼
                  [ Global Anycast Load Balancer ]
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│               Collaborative Gateway Layer (Stateless Go / Node)           │
│  ├── TLS Termination & Auth Guard (Token & Document ACL)                  │
│  └── WebSocket Session Router (Consistent Hash by DocumentID)             │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│           Document Room Cluster (Stateful Actor Model / Erlang OTP)       │
│  ├── Room Actor (Document-1001 Instance):                                 │
│  │   ├── In-Memory Head State (Merged CRDT / Vector Clock)                │
│  │   ├── Ephemeral Presence Broadcaster (光标位置、选中区域、用户头像)    │
│  │   └── Broadcast Hub (增量差异 Update 推送至房间内所有活跃连接)         │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    Persistence & Storage Pipeline Layer                   │
│  ├── Append-Only Event Log (WAL, RocksDB / Kafka: 顺序追加每笔 Update)    │
│  ├── Snapshot Compaction Worker (每 5 分钟将增量折叠，生成全量 Blob 快照) │
│  └── Cold Storage Sink (快照转储至 S3 / Ceph，元数据存入 PostgreSQL)       │
└───────────────────────────────────────────────────────────────────────────┘
```

### 6.1 房间模型（Room Actor Model）与连接亲和性
- 每一个正在被编辑的文档在后台对应一个**轻量级房间 Actor 实例**（例如使用 Go goroutine 或 Erlang GenServer）；
- **一致性哈希路由**：API 网关根据 `DocumentID` 进行哈希分流，确保编辑同一文档的所有 WebSocket 连接严格汇聚到同一台协同服务器上的同一个 Room Actor；
- **广播加速**：Room Actor 接收到某个客户端的二进制 CRDT 差异增量（Update），校验版本后，在内存中就地应用并立即向房间内其他客户端广播，端到端延迟通常 **小于 30ms**。

### 6.2 易失性状态分离：Presence 协议
并非所有协同信息都需要做持久化与一致性保证。
- **光标移动、鼠标轨迹、文字选中高亮（Presence / Awareness）**属于**高频且易失性数据（Ephemeral Data）**；
- 采用非可靠广播协议或轻量级的自增时间戳更新，在 Redis 内存缓存中设置 10 秒 TTL；客户端断线或失去心跳时，其光标在其他人的屏幕上自动淡出消失，绝不写入底层的文档 CRDT 核心日志。

---

## 七、面试高频追问与 Staff 级应答策略

### Q1：为什么 Figma、Notion 和 Apple Notes 最终全面选择 CRDT，而早期成熟的 Google Docs 依然坚守 OT？
> **深度回答**：
> 1. **历史技术债务与投资规模**：Google Docs（始于 2006 年收购的 Writely）投入了十几年时间在 C++ 层面构建了极致工程化调优的 Jupiter OT 引擎。其文本存储为连续扁平字符串，内存利用率极高，且与服务端权限审计、版本历史紧密耦合。推倒重构成 CRDT 商业风险巨大；
> 2. **协同拓扑形态的本质差异**：
>    - Google Docs 的核心假设是**在线企业级文档**，网络稳定，依赖服务端强鉴权与集中式定序；
>    - Figma、Notion 和 Apple Notes 面向的是**本地优先（Local-First）、跨设备无缝漫游与弱网/离线创作**。用户在飞机上断网编辑笔记本，落地联网后与手机端对等合并。这种去中心化或长离线合并在 OT 下极其痛苦，而 CRDT 在数学模型上与离线无冲突合并天然契合。

### Q2：CRDT 中的墓碑（Tombstone）累积会导致内存随着文档长期编辑无限膨胀，如何进行安全的垃圾回收（GC）？
> **深度回答**：
> 1. **全员确认状态向量（Stable State Vector）**：
>    不能单方面物理删除墓碑，因为可能存在某个长时间断网的客户端在未来携带基于该被删字符的插入操作重新上线。
> 2. **向量时钟安全边界推进**：
>    所有客户端定期向服务端同步各自的当前状态向量（State Vector）。服务端计算出所有在线活跃客户端的**最大公共前缀（Greatest Common Snapshot）**；
> 3. **安全压缩截断（Pruning）**：
>    如果某个字符被标记为删除，且全网所有副本的已确认时钟均大于该删除操作的 Lamport 时钟，则判定该字符的左右邻居关系再也不会被任何并发操作所引用。此时后台 Compactor 可以安全地将该墓碑从物理双向链表中彻底剥离并合并相邻块。

### Q3：如果某个恶意客户端伪造逻辑时钟，发送包含数亿个自增 ID 的恶意数据包，如何防止破坏 CRDT 状态？
> **深度回答**：
> 1. **服务端前置权威校验（Server-Enforced Causality Check）**：在协同网关层对客户端上报的 Update 实施严格的因果性断言。客户端的 Lamport 时钟相对于服务端记录的该 Client 上一次时钟，递增步长必须严格等于其附带的操作长度，禁止时钟超前跃迁；
> 2. **结构大小与频率硬限流**：单次 WebSocket 帧大小硬性限制（如最大 64KB），对单个连接每秒产生的 Update 数量实施令牌桶限流；
> 3. **签名与凭证隔离**：客户端生成的每个 CRDT 块打上由服务端签发的 SessionToken 哈希，杜绝伪造其他用户的 ClientID 实施冒名插入。

---

## 八、总结与架构精要对照表

多人协同编辑系统的演进，是分布式系统从“依赖中心定序的强同步工程”向“基于抽象代数公理的自愈合收敛系统”的深刻变革：

| 架构维度 | 传统中心化 OT 架构 | 现代工业级 CRDT 架构 |
| :--- | :--- | :--- |
| **理论基石** | 操作转换矩阵（Ellis & Gibbs 1989） | 半格代数拓扑与无冲突收敛（Marc Shapiro 2011） |
| **网络拓扑** | 必须依赖单点中心定序器（Jupiter 架构） | 任意拓扑（星型、树型、P2P WebRTC、纯离线优先） |
| **并发冲突** | 运行时计算坐标平移修正（$T(O_A, O_B)$） | 绝对不可变全局分数逻辑坐标，全序比较无冲突 |
| **离线编辑能力** | 弱。离线累积大量操作后，重基（Rebase）极度复杂 | 原生天然支持。断网数月重新联网直接双向合并收敛 |
| **内存开销** | 极低（纯连续字符串 + 内存轻量日志） | 早期存在百倍膨胀，现代 Yjs/Automerge 借 RLE 块压缩至原生 1.5 倍 |
| **适用场景** | 传统中心化在线 Web 办公套件 | Local-First 应用、现代富交互画布（Figma）、协同看板 |

---

## 参考资料与规范出处

- **C. Ellis & S. Gibbs** (SIGMOD 1989) - *Concurrency Control in Groupware Systems (The Invention of OT)*.
- **Marc Shapiro, Nuno Preguiça, Carlos Baquero, Marek Zawirski** (INRIA / SSS 2011) - *Conflict-free Replicated Data Types (CRDTs)*.
- **David A. Nichols et al.** (Xerox PARC, UIST 1995) - *High-Latency, Low-Bandwidth Windowing in the Jupiter Collaboration System*.
- **Kevin Jahns** (2016) - *Yjs: High-Performance Shared Types and YATA CRDT Algorithm Implementation*.
- **Martin Kleppmann et al.** (ACM Programming Languages, 2022) - *Peritext: A Conflict-Free Replicated Data Type for Collaborative Rich Text Editing*.
