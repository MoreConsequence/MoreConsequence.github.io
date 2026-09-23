---
title: "分布式事务的终局决战：从 2PC 阻塞挂起到 TCC 悬挂防御与 Transactional Outbox"
description: "深度拆解微服务与异构存储环境下分布式事务的底层一致性拓扑与工程演进。从 Jim Gray 1978 开山论文 2PC 两阶段提交的同步阻塞与单点脑裂死穴，到 Garcia-Molina 1987 Saga 长事务补偿状态机与隔离性缺失；从 TCC（Try-Confirm-Cancel）业务资源预留、空回滚、业务悬挂的防御矩阵，到基于 CDC 与 Debezium 的 Transactional Outbox 最终一致性最佳实践。"
publishedAt: "2026-05-21"
series: "资深工程师面试深度拆解"
tags: ["系统设计", "面试题", "分布式事务", "2PC", "TCC", "Saga", "Transactional Outbox"]
category: "面试深度拆解"
draft: false
featured: false
---

**TL;DR：** 在微服务、多库架构与异构存储（MySQL、PostgreSQL、Redis、Kafka）的工业级现实中，“跨网络维护数据一致性”是所有分布式系统面临的终极考验。单机数据库依赖本地 WAL、两阶段加锁（2PL）与 MVCC 构建的强 ACID 乌托邦，在网络分区与非对称时延下彻底碎裂。本文从数据库泰斗 Jim Gray 奠基的 **2PC（两阶段提交）** 切入，剖析其在协调者宕机时的不可解阻塞挂起；解构 Hector Garcia-Molina 提出的 **Saga 长事务补偿模型** 及其缺乏隔离性（Lack of Isolation）的业务解法；深入攻克 **TCC 模式** 下的三大致命陷阱：**空回滚、业务悬挂与幂等乱序**；最后落地基于数据库事务日志捕获（CDC）与 **Transactional Outbox（事务发件箱）** 的高可用最终一致性工业标杆方案。

---

## 一、物理现实：ACID 在分布式网络中的破灭

### 1.1 跨服务一致性的物理困境

在单体单库架构下，一次“用户购买商品”的业务逻辑在单个事务内闭环：
```sql
BEGIN TRANSACTION;
UPDATE account SET balance = balance - 100 WHERE user_id = 1;
UPDATE inventory SET stock = stock - 1 WHERE item_id = 99;
INSERT INTO orders (order_id, user_id, item_id) VALUES (101, 1, 99);
COMMIT;
```
底层的 InnoDB 存储引擎通过集中式锁管理器锁住行记录，通过本地 Redo Log 保证持久性（Durability），通过 Undo Log 保证原子性（Atomicity），在毫秒级完成单机 ACID 提交。

但在现代微服务拓扑中：
- 账户数据位于独立的 **账户服务（Oracle / MySQL）**；
- 库存数据位于独立的 **库存服务（PostgreSQL）**；
- 订单数据位于独立的 **订单服务（分布式分库分表集群）**；
- 积分赠送位于 **积分服务（Redis / MongoDB）**。

```
Client Order Request
        │
        ├── 1. AccountService.DeductMoney()  ──> [ Account DB ] (Commit OK!)
        │
        ├── 2. InventoryService.DeductStock() ──> [ Inventory DB ] (Commit OK!)
        │
        └── 3. OrderService.CreateOrder()    ──> [ Order DB ] (💥 NETWORK TIMEOUT / CRASH!)
```

#### 分布式不确定性的三大深渊：
1. **两将军问题（Two Generals' Problem）**：在不可靠网络下，确认信息可能永久丢失，发送方永远无法百分之百确信接收方是否真正完成了操作；
2. **FLP 不可能性定理（Fischer-Lynch-Paterson, 1985）**：在异步网络模型中，哪怕只有一个节点可能发生崩溃，就不存在任何确定性的共识算法能够保证系统同时满足“安全性（Safety）”与“活性（Liveness）”；
3. **CAP 定理的硬性权衡**：当网络分区（P）必然发生时，架构师必须在“强一致性阻塞不可用（CP）”与“牺牲瞬间一致性追求最终一致（AP）”之间做出艰难决断。

---

## 二、经典协议批判：从 2PC 同步阻塞到 3PC 的理论破产

### 2.1 Jim Gray 的 2PC（两阶段提交，Two-Phase Commit）

1978 年，图灵奖得主 Jim Gray 在《Notes on Data Base Operating Systems》中首次系统化提出了分布式两阶段提交协议。

```
Coordinator (协调者)                               Participants (参与者 A, B)
     │                                                        │
     │─── Phase 1: PREPARE (Can you commit?) ────────────────>│
     │                                                        │ 写入 Undo/Redo Log,
     │                                                        │ 占用行级独占排他锁 (X-Lock),
     │<── VOTE_COMMIT / VOTE_ABORT ───────────────────────────│ 执行 SQL 但不提交
     │                                                        │
     │ (收集全员投票)                                          │
     │                                                        │
     │─── Phase 2: GLOBAL_COMMIT / GLOBAL_ABORT ─────────────>│
     │                                                        │ 提交事务，物理释放行锁
     │<── ACK (Done) ─────────────────────────────────────────│
```

### 2.2 2PC 的三大致命物理缺陷

为什么大型高并发分布式系统（如阿里、亚马逊、Google 外部服务）坚决禁止使用原生 XA 2PC？

1. **同步阻塞（Synchronous Blocking & Resource Starvation）**：
   在 Phase 1 投票 `VOTE_COMMIT` 之后，参与者持有的**数据库行级排他锁不能释放**，必须一直等到 Phase 2 的指令到达。
   如果网络发生抖动，或者协调者在发出 `PREPARE` 后发生长 GC 甚至物理断电：
   **所有参与者节点上被加锁的资源（如热点账户行记录、热点库存记录）将被死死锁住数秒乃至数小时，导致后续全网所有并发事务全部被阻塞排队，系统吞吐瞬间跌零！**
2. **单点故障（Single Point of Failure, SPOF）与挂起不决（In-Doubt State）**：
   若协调者在 Phase 2 发送 `GLOBAL_COMMIT` 的那一瞬间物理宕机，且网络发生分区：
   参与者 A 收到了 Commit 并提交了；参与者 B 没有收到，陷入“挂起不决”状态。由于参与者无法感知其他节点的状态，为了防止脑裂，参与者 B 只能保持阻塞，既不敢提交，也不敢回滚。
3. **数据不一致（Partial Commit）**：
   在 Phase 2，协调者发出的 Commit 广播由于局部交换机故障，只有一部分节点收到并执行了 Commit，另一部分网络中断的节点超时后触发了 Abort，**系统彻底发生不可逆的数据分叉损坏！**

### 2.3 3PC（三阶段提交）为什么无法挽救异步网络？

1981 年 Dale Skeen 提出了 3PC（划分出 CanCommit、PreCommit、DoCommit），试图通过引入超时机制解除参与者永久阻塞。
**然而学术界早已严格证明：3PC 仅在不存在网络分区（No Network Partition）的弱假设下成立**。一旦出现网络断连与分区，3PC 的 PreCommit 超时自动提交会直接导致两个分区分别执行了 Commit 和 Abort，脑裂破坏性甚至比 2PC 更加严重！

---

## 三、长事务解决方案：Garcia-Molina 的 Saga 补偿模型

为了解决长时间持有全局数据库锁导致的吞吐崩溃，普林斯顿大学的 Hector Garcia-Molina 与 Kenneth Salem 于 1987 年在 SIGMOD 会议上提出了 **Saga** 模式。

### 3.1 核心理念：将长事务切分为带补偿的局部事务链

Saga 将一个全局分布式事务拆分为一系列有序的**本地 ACID 事务序列**：

$$\text{Global Transaction} = \langle T_1, T_2, \dots, T_n \rangle$$

每个局部事务 $T_i$ 在其本地数据库中**立即提交（Immediate Commit）并释放锁**。同时，为每个 $T_i$ 严格设计一个对应的**补偿事务（Compensating Transaction）$C_i$**：

$$\text{Compensations} = \langle C_1, C_2, \dots, C_{n-1} \rangle$$

- **正常流程（Happy Path）**：
  $$T_1 \to T_2 \to \dots \to T_n \quad (\text{全链路成功执行})$$
- **异常反向恢复（Backward Recovery）**：
  若在执行第 $k$ 步 $T_k$ 时发生业务校验失败（例如余额不足）：
  Saga 协调器按相反顺序依次调用已提交步骤的补偿事务：
  $$C_{k-1} \to C_{k-2} \to \dots \to C_1$$
  将系统状态恢复至事务发起前的逻辑等价点。

```
Normal Execution:
[ T1: 扣除用户余额 (已提交) ] ──> [ T2: 预扣商品库存 (已提交) ] ──> [ T3: 生成物流单 (💥 失败!) ]
                                                                             │
Backward Recovery:                                                           ▼
[ C1: 退还用户余额 (补偿) ]  <── [ C2: 释放商品库存 (补偿) ]  <──────────────┘
```

### 3.2 Saga 协调拓扑：编排式（Orchestration）vs 协同式（Choreography）

| 拓扑模式 | 运转机制 | 优势 | 劣势 |
| :--- | :--- | :--- | :--- |
| **协同式（Choreography）** | 服务之间通过 Kafka 事件驱动（A 完成发事件，B 监听事件继续） | 无中心节点，解耦彻底 | 存在隐式因果环路，当流程包含 10 个以上服务时，全链路拓扑追踪极其痛苦 |
| **编排式（Orchestration）** | 引入专门的 Saga Orchestrator（如 Temporal、Camunda、Seata）驱动状态机 | 集中控制，直观清晰，状态机显式定义，超时重试可控 | 编排器本身需要具备高可用与持久化状态机能力 |

### 3.3 Saga 的阿喀琉斯之踵：彻底丧失隔离性（Lack of Isolation）

Saga 满足原子性、一致性与持久性，但**彻底打破了 ACID 中的隔离性（Isolation）**！

#### 脏读与覆盖更新的灾难场景：
1. $T_1$ 执行成功：用户账户扣减了 10,000 元（本地已 Commit）；
2. 此时用户打开手机银行 App，查询到余额变成了 0 元；
3. 突然系统检测到 $T_3$ 失败，Saga 启动逆向补偿 $C_1$；
4. 在 $C_1$ 尚未执行完的间隙，用户向客服投诉甚至发起二次贷款；
5. **更严重的问题：不可逆的现实物理行为（Pivot Step）**：
   如果 $T_3$ 是“ATM 机吐出现钞”或者“第三方调用发送了短信”，现实世界中的物理动作是**无法通过简单的“代码反向补偿”直接撤回的**！

#### 工业级隔离性防御策略：
- **语义锁（Semantic Lock）**：在业务表增加中间态标记（如 `status: PENDING_DEDUCTION`），阻止其他并发事务读取该资金；
- **悲观资金预留（Hold Balance）**：严禁直接修改账户主余额，而是将资金划入临时冻结子账户，从而在逻辑层面模拟隔离性。

---

## 四、业务级两阶段预留：TCC（Try-Confirm-Cancel）深入攻坚

为了兼顾 2PC 的严格强隔离性与 Saga 的高并发非阻塞性，业界演化出了 **TCC** 模式。TCC 的本质是：**在应用层代码层面，实现业务维度的两阶段资源预留！**

### 4.1 TCC 核心三个阶段的形式化语义

```
                        [ TCC Coordinator ]
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       AccountService.Try()            InventoryService.Try()
       (检查余额，冻结 100 元)          (检查库存，冻结 1 件)
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼ (全部 Try 成功)
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
      AccountService.Confirm()        InventoryService.Confirm()
      (正式扣减 100 冻结金)            (正式扣减 1 件冻结库存)
```

1. **Try 阶段**：
   - 检查业务前置条件（账户状态正常、可用余额充足）；
   - **完成所有业务资源的预留（Reserve Resources）**：并不直接扣除主账户余额，而是将可用资金划转到该订单的专属 `frozen_balance` 字段中。
2. **Confirm 阶段**：
   - 确认执行业务操作；
   - **仅使用 Try 阶段已经预留的资源**：直接扣除 `frozen_balance`。Confirm 操作在设计上必须保证**绝对成功（No Business Failure）**，即便网络超时也要持续重试直至成功。
3. **Cancel 阶段**：
   - 取消执行，释放 Try 阶段预留的业务资源；
   - 将 `frozen_balance` 原路返还回 `available_balance`。同样必须保证具备重试直至成功的自愈能力。

### 4.2 TCC 的三大致命陷阱与防御矩阵（面试绝对死穴）

在工业生产中，网络延迟、丢包重试与乱序投递，会导致 TCC 遭遇三类毁灭性的异常时序：

```
                ┌─────────────────────────────────────────────────┐
                │             TCC 三大异常时序防御状态矩阵          │
                └─────────────────────────────────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
【陷阱一：空回滚 (Empty Rollback)】 【陷阱二：业务悬挂 (Suspension)】 【陷阱三：幂等重试 (Idempotence)】
Try 请求网络丢失或严重超时，      Cancel 执行完毕后，延迟极久的    Confirm/Cancel 因网络丢包
协调者超时触发 Cancel。此时      Try 请求才终于到达。若执行了     重试多次。若未做幂等，
Cancel 必须感知“Try 压根没跑”，   Try，预留资源将永远被冻结挂起！  可能导致重复解冻或扣减！
不能盲目反向退钱！               必须严格拒绝该迟到的 Try！
```

#### 1. 陷阱一：空回滚（Empty Rollback）
- **发生时序**：协调者调用参与者 A 的 Try。由于跨机房网络抖动，该 HTTP/gRPC 请求在网关处丢包，参与者 A 根本没有收到 Try 请求。
- **触发矛盾**：协调者等待 3 秒超时后，判定事务失败，向参与者 A 发送 `Cancel` 请求。
- **错误解法**：参与者 A 的 Cancel 盲目执行 `balance = balance + 100`。由于之前根本没扣过钱，这一回滚凭空给用户增加了 100 元资产！
- **生产级防御机制**：
  必须在参与者本地维护一张**事务控制记录表（`tcc_transaction_log`）**：
  ```sql
  CREATE TABLE tcc_transaction_log (
      tx_id VARCHAR(64) NOT NULL,
      action_name VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL, -- TRYING, CONFIRMED, CANCELED
      PRIMARY KEY (tx_id, action_name)
  );
  ```
  当 Cancel 到达时，先查询该 `tx_id` 是否存在对应的 Try 记录：
  **若没有任何 Try 记录，说明发生了空回滚！Cancel 阶段仅在日志表中插入一条 `status = 'CANCELED'` 的标记，绝对不执行资金释放逻辑！**

#### 2. 陷阱二：业务悬挂（Suspension / Hanging）
- **发生时序**：在上一步空回滚发生之后，那个在网络路由队列中被阻塞卡顿了长达 30 秒的陈旧 Try 请求，突然到达了参与者 A！
- **毁灭后果**：若参与者 A 盲目执行 Try，它将用户的 100 元资金划入了 `frozen_balance`。然而此时全局事务早已经宣告结束（Cancel 已经执行完毕且再也不会被触发），这 100 元冻结资产将**永远处于冻结悬挂状态，造成用户资金永久蒸发！**
- **生产级防御机制**：
  在 Try 执行的一开始，先使用同一事务检查 `tcc_transaction_log`：
  **若发现当前 `tx_id` 已经存在 `status = 'CANCELED'` 的记录，说明 Cancel 已经先于 Try 到达执行完毕！此时 Try 必须直接抛出异常中断执行，严禁预留任何资源！**

#### 3. 陷阱三：幂等性（Idempotence）
- 由于网络超时重试，Confirm 或 Cancel 请求可能被连续发送 5 次；
- **防御**：在执行确认或取消时，利用唯一事务主键约束或前置状态断言：
  ```sql
  UPDATE account_balance
  SET frozen_balance = frozen_balance - 100
  WHERE user_id = :user_id 
    AND frozen_balance >= 100;
  ```
  结合事务日志表的状态检查，若已处于 `CONFIRMED` 或 `CANCELED`，直接就地返回成功，防止重复扣减。

---

## 五、工业级终极范式：Transactional Outbox 与 CDC 最终一致性

尽管 TCC 与 Saga 能够解决复杂的跨服务业务，但它们要求业务工程师手工编写大量的 Try、Confirm、Cancel、Compensate 逻辑，研发与排障成本极其高昂。

在实际工业界中，超过 **$80\%$ 的跨服务一致性场景**（如订单创建后扣减积分、发送通知、更新数据大盘）属于**“核心操作必须成功，后续下游允许秒级延迟达到最终一致”**。
针对这一普适场景，**Transactional Outbox（事务发件箱模式）** 配合 **CDC（Change Data Capture）** 构成了目前业界性价比最高的工业级黄金解法。

```
[ Business Application Service ]
       │
       ├── 开启单个本地数据库事务 (Zero 2PC, 纯单机 ACID)
       ▼
┌─────────────────────────────────────────────────────────────┐
│                 Local Primary Database (MySQL)              │
│                                                             │
│  1. INSERT INTO orders (order_id, user_id, amount) ...;     │
│  2. INSERT INTO outbox_table (msg_id, payload, status) ...; │
│                                                             │
│  COMMIT; (两个本地写入具备绝对原子性：要么全成功，要么全失败)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ (数据库内部持久化 WAL / Binlog)
┌─────────────────────────────────────────────────────────────┐
│           Change Data Capture Engine (Debezium / Flink CDC) │
│  ├── 异步增量监听 MySQL Binlog / PostgreSQL WAL             │
│  └── 提取 outbox_table 的新插入记录                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ 严格单调追加，零业务数据库侵入
┌─────────────────────────────────────────────────────────────┐
│                 Distributed Message Bus (Kafka)             │
│  Topic: "order-created-events" (At-Least-Once Delivery)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ Consumer Group (Idempotent Apply)
┌─────────────────────────────────────────────────────────────┐
│               Downstream Microservices (Points, Push, BI)   │
│  ├── Check: INSERT INTO msg_processed (msg_id) VALUES (?)    │
│  └── Apply Business Logic: 增加用户积分 / 发送短信通知       │
└─────────────────────────────────────────────────────────────┘
```

### 5.1 彻底规避双写不一致（Dual-Write Dilemma）
朴素系统常见严重 Bug：先写数据库，再发 Kafka；或者先发 Kafka，再写数据库。
- 若先写 DB 成功，发 Kafka 时网络断开，下游永远无法收到事件；
- 若先发 Kafka 成功，写 DB 触发唯一索引冲突回滚，下游却已经处理了脏事件。

#### Outbox 模式的降维打击：
**将“发消息”的动作，退化为在当前业务数据库内“向发件箱表写入一行记录”！**
因为业务操作（`orders`）和发件记录（`outbox_table`）处于同一个物理数据库，完全能够利用本地事务的绝对原子性（Local ACID Transaction）保证绝对的一致，彻底消除双写不一致。

### 5.2 CDC 相比定时轮询（Polling）的物理优势
早期系统采用独立线程 `SELECT * FROM outbox_table WHERE status = 'PENDING' LIMIT 100` 轮询发件箱。
- **轮询弊端**：产生频繁的数据库 CPU 抖动与读 I/O 损耗，且存在秒级延迟；
- **现代 CDC（Debezium / Canal）**：
  直接模拟为 MySQL 的 Slave，通过网络流式读取 MySQL 原生二进制日志（Binlog）或 PostgreSQL 的逻辑解码（Logical Decoding WAL）。
  - **零业务库读压力**：不执行任何 SQL 查询，纯顺序读取已持久化的日志流；
  - **毫秒级亚秒时延**：事务在 Master 提交的瞬间，CDC 即可捕获并推送到 Kafka，端到端延迟通常 **小于 100ms**。

---

## 六、分布式事务全景技术选型决策树

面对系统设计面试，顶级候选人绝不会一上来就兜售“全套 TCC”或“强推 2PC”，而是展示清晰的**架构经济学权衡决策**：

```
                              是否存在跨系统 / 跨库的一致性诉求？
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼ 否                                            ▼ 是
       【单库局部事务 (Local ACID)】                       下游业务是否必须毫秒级强同步响应？
       (严格通过单一数据库事务解决，                                   │
        禁止过度架构设计！)                             ┌───────────────┴───────────────┐
                                                       ▼ 否                            ▼ 是
                                       【最终一致性 (AP 路线)】          下游是否具备资源冻结/预留能力？
                                                       │                               │
                                      ┌────────────────┴───────────────┐   ┌───────────┴───────────┐
                                      ▼                                ▼   ▼ 否                    ▼ 是
                         【Transactional Outbox + CDC】    【Saga 长事务补偿】 【强隔离 2PC / XA】   【TCC 模式】
                         (解耦异步通知、发积分、记日志)    (跨多系统订机票酒店) (极少选用，吞吐要求极低) (金融核心扣划)
```

---

## 七、面试高频追问与 Staff 级应答策略

### Q1：在 Transactional Outbox 模式中，Kafka 只能保证“至少投递一次（At-Least-Once）”，如果消息重复投递给下游服务，如何设计消费端的绝对幂等？
> **深度回答**：
> 1. **唯一消费记录表（Unique Consumption Log）**：
>    下游消费者在处理消息前，在同一个本地数据库事务中先向 `consumed_messages` 表插入 `(msg_id, consumer_group)`。利用数据库唯一主键约束，若发生唯一性冲突，立即中止当前事务并向 Kafka 回复 ACK（判定为重复投递，丢弃即可）；
> 2. **业务级天然幂等与单调状态机**：
>    在更新订单或资产状态时，采用状态前置断言：
>    ```sql
>    UPDATE orders SET status = 'PAID' WHERE order_id = :id AND status = 'WAITING_PAY';
>    ```
>    若受影响行数为 0，说明该订单已被处理过或状态已流转，直接忽略，天然具备防重复能力。

### Q2：如果在 TCC 事务的 Confirm 阶段，某个参与者节点彻底断网宕机长达 2 小时，协调器该如何处理？会把整个事务回滚吗？
> **深度回答**：
> 1. **Confirm 阶段绝不允许回滚（No Rollback in Confirm）**：
>    TCC 协议规定：一旦所有参与者在 Try 阶段投票全部成功，**全局事务的归宿必须且只能是 Confirm 成功**！如果在 Confirm 阶段允许部分回滚，由于其他参与者已经正式提交，将导致全局状态彻底裂解；
> 2. **死磕重试与告警接入（Persistent Retry & Alerting）**：
>    协调器必须将该未能确认的任务写入死信持久化重试队列，采用指数退避算法持续重试调用该节点的 Confirm 接口；
> 3. **人工兜底与补偿对账（Reconciliation Engine）**：
>    若该节点硬件永久损坏且无法恢复，触发 P0 级严重运维报警，由后台对账流水线输出差异平账报表，通过人工运维接口或差错补正任务完成最终收敛。

### Q3：为什么阿里开源的 Seata AT 模式能够在不写 Try/Confirm/Cancel 的情况下自动生成反向补偿？它有什么潜在风险？
> **深度回答**：
> 1. **AT 模式的原理：自动 SQL 解析与 Undo Log 构建**：
>    Seata 代理了业务数据源（DataSource Proxy）。在执行业务 SQL（如 `UPDATE account SET balance = 50 WHERE user_id = 1`）之前：
>    - 自动查询当前镜像（Before Image）：`balance = 100`；
>    - 执行真实业务更新并提交，同时查询后置镜像（After Image）：`balance = 50`；
>    - 将新旧镜像序列化存入本地 `undo_log` 表。若后续全局回滚，框架自动反向生成 `UPDATE account SET balance = 100` 还原数据。
> 2. **核心潜在风险：脏写（Dirty Write）与锁穿透**：
>    如果存在非 Seata 管理的外部系统或人工 DBA 直接在控制台修改了该行数据（将 balance 改为了 30），Seata 在回滚校验 Before Image 时会发现数据已被篡改，**直接触发回滚补偿失败并锁死事务**。因此，AT 模式要求全链路的所有写操作必须严格被全局锁管理。

---

## 八、总结与分布式事务核心对照清单

分布式事务架构的演进，是**从对强一致性乌托邦的盲目追求，走向直面物理不可靠性的业务解耦与优雅降级**：

| 事务方案 | 一致性模型 | 性能与吞吐 | 业务侵入度 | 核心技术风险与解法 |
| :--- | :--- | :--- | :--- | :--- |
| **XA 2PC / 3PC** | 强一致性（CP） | 极低（全局行锁同步阻塞） | 低（数据库底层支持） | 协调者单点挂起不决，高并发下行锁争用引发雪崩，现代架构基本弃用 |
| **TCC** | 最终一致性（两阶段预留） | 极高（独立微事务，无全局长锁） | **极高**（需手工实现 Try/Confirm/Cancel） | 必须严格设计防御状态表，解决空回滚、业务悬挂与重试幂等 |
| **Saga** | 最终一致性（长事务补偿） | 高（局部事务即刻提交） | 中（需为每一步编写正向反向逻辑） | 彻底丧失隔离性（脏读风险），需结合语义锁与悲观资金预留 |
| **Transactional Outbox + CDC** | 最终一致性（事件驱动 AP） | **最高**（纯单机 ACID + 异步消息流） | **最低**（业务无感，通过数据库 WAL 驱动） | 下游必须实现强幂等消费与滑动窗口防重判重 |

---

## 参考资料与规范出处

- **Jim Gray** (1978) - *Notes on Data Base Operating Systems (The Foundation of Two-Phase Commit)*.
- **Hector Garcia-Molina & Kenneth Salem** (Princeton University, SIGMOD 1987) - *Sagas*.
- **Dan Pritchett** (eBay, ACM Queue 2008) - *Base: An Acid Alternative*.
- **Chris Richardson** - *Microservices Patterns (The Transactional Outbox and Saga Patterns)*.
- **Debezium Official Documentation** - *Change Data Capture Architecture and Outbox Event Routing*.
