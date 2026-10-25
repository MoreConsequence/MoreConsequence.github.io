---
title: "CRDT 计数器收敛原理：从半格公理到 G-Counter 与 PN-Counter 实现"
description: "无锁多主写入与离线协同依赖 CRDT（无冲突复制数据类型）。本文从半格数学公理出发，推导 G-Counter 只增计数器、PN-Counter 增减计数器与 LWW-Register 寄存器的状态机合并机制与生产权衡。"
publishedAt: "2026-09-14"
updatedAt: "2026-10-21"
tags: ["分布式系统", "CRDT", "最终一致性", "无锁架构", "系统设计"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 在跨地域多活或移动端离线协同场景下，强一致性锁协议（如 2PC、Raft）会因为高网络时延或网络分区而无法提供写可用性。CRDT（Conflict-free Replicated Data Types）通过半格（Semi-Lattice）代数结构，赋予并发写入单调收敛的数学保证。G-Counter 将写入限定在各节点的私有槽位，状态合并通过逐槽位取极大值（`max`）完成，满足交换律、结合律与幂等性。针对减法操作，PN-Counter 拆解为两个正向只增计数器，解决了单槽减法被 `max` 吞噬的悖论。结合 LWW-Register（最后写入胜）的节点决胜规则，构建出无中心协调的分布式数据结构基石。

## 一、破局之钥：强一致性瓶颈与半格公理

在 CAP 定理的约束下，传统分布式事务为了维护线性一致性，必须在写入路径上执行仲裁确认。当机房跨洋通信（时延 150ms+）或边缘设备断网时，写入被彻底阻塞。

2011 年，Marc Shapiro 等人在 INRIA 论文中正式确立了基于状态的无冲突复制数据类型（State-based CvRDT）。其核心在于：若状态空间是一个偏序集，且任意两个状态的合并操作（Join / \(\sqcup\)）构成一个半上限半格（Join-Semilattice），则系统无需中央锁即可收敛到同一状态。

合并函数 \( \sqcup \) 必须严格满足三条代数公理：
1. **交换律（Commutativity）**：\( x \sqcup y = y \sqcup x \)，消息乱序到达不影响最终状态。
2. **结合律（Associativity）**：\( (x \sqcup y) \sqcup z = x \sqcup (y \sqcup z) \)，多跳传递或批量批处理不改变结果。
3. **幂等性（Idempotence）**：\( x \sqcup x = x \)，网络重试或重复消息投递不会导致状态重复累加。

## 二、G-Counter（只增计数器）的状态结构与收敛

G-Counter（Grow-Only Counter）是最基础的 CvRDT。每个节点只能单调增加计数。

### 1. 槽位隔离与合并算法

设集群包含 \( N \) 个节点。G-Counter 在每个节点内部维护一个长度为 \( N \) 的状态向量 \( V \)。
节点 \( i \) 仅对自己的槽位 \( V[i] \) 拥有自增写权限。

```text
节点 A (槽位 0): [5, 0, 0]  (自增 5 次)
节点 B (槽位 1): [0, 7, 0]  (自增 7 次)
节点 C (槽位 2): [0, 0, 11] (自增 11 次)

合并过程:
A 合并 B -> [max(5,0), max(0,7), max(0,0)] = [5, 7, 0]
再合并 C -> [max(5,0), max(7,0), max(0,11)] = [5, 7, 11]

当前总计 = 5 + 7 + 11 = 23
```

```python
class GCounter:
    def __init__(self, n, i):
        self.v = [0] * n
        self.i = i

    def inc(self, k=1):
        self.v[self.i] += k

    def merge(self, other):
        merged = [max(a, b) for a, b in zip(self.v, other.v)]
        c = GCounter(len(merged), self.i)
        c.v = merged
        return c

    def total(self):
        return sum(self.v)
```

### 2. 状态机断言验证

实验测试证明了三定律在代码层面的成立：
- **顺序无关性**：`A.merge(B).merge(C)` 与 `C.merge(A).merge(B)` 得到的总和严格恒等于 23。
- **重复合并幂等**：`A.merge(B).merge(B).merge(A)` 的总数依然是 12，无二次膨胀。
- **槽位可见性**：节点 A 写入增量 3，节点 B 与之合并后立即在其私有视图中读取到 `[3, 0]`。

## 三、减法难题：PN-Counter 的双半格解构

G-Counter 无法直接支持减法。如果节点直接将私有槽位从 5 扣减到 4，当它与远端持有旧值 5 的副本合并时，`max(4, 5)` 将返回 5，减法操作会被静默擦除。

### 1. PN-Counter 架构设计

PN-Counter（Positive-Negative Counter）通过结构分解化解了这一矛盾。它在底层组合了两个独立的 G-Counter：
- 向量 \( P \)：专门记录所有累加增量。
- 向量 \( Q \)：专门记录所有扣减增量。

当前计数器的有效值定义为正负向量的差值：

\[
\text{Value} = \sum_{j=0}^{N-1} P[j] - \sum_{j=0}^{N-1} Q[j]
\]

当节点执行 `dec(k)` 时，它不对 \( P \) 进行减少，而是将自己的扣减槽位自增 \( Q[i] \leftarrow Q[i] + k \)。合并时，\( P \) 向量与 \( Q \) 向量分别独立执行逐槽位 `max` 运算。

```python
class PNCounter:
    def __init__(self, n, i):
        self.p = [0] * n
        self.q = [0] * n
        self.i = i

    def inc(self, k=1):
        self.p[self.i] += k

    def dec(self, k=1):
        self.q[self.i] += k

    def value(self):
        return sum(self.p) - sum(self.q)

    def merge(self, other):
        c = PNCounter(len(self.p), self.i)
        c.p = [max(a, b) for a, b in zip(self.p, other.p)]
        c.q = [max(a, b) for a, b in zip(self.q, other.q)]
        return c
```

在测试中，节点 X 并发执行（+10, -3），节点 Y 并发执行（+5, -8）。两节点双向合并后，无论以何种顺序合并，最终计算结果恒等于 4，且重复投递的减法合并不会导致重复扣减。

## 四、寄存器赋值：LWW-Register 与决胜裁决

对于非数值类的变量赋值，系统采用 LWW-Register（Last-Write-Wins Register）。

### 1. 三元组时钟与平局裁决

LWW 寄存器维护状态三元组 `(wallclock_ts, node_id, value)`。
当两个副本合并时，比较元组大小：

\[
\text{State}_A > \text{State}_B \iff (\text{ts}_A > \text{ts}_B) \lor (\text{ts}_A = \text{ts}_B \land \text{node}_A > \text{node}_B)
\]

通过将不可重复的 `node_id` 拼入比较主键，即使两个分布式节点在物理时钟完全相同的一纳秒内发生写入冲突，系统依然能确定性地选出同一赢家，彻底消除分歧。

```python
class LWWRegister:
    def __init__(self, node):
        self.node = node
        self.ts, self.val = -1, None

    def set(self, ts, val):
        if ts > self.ts:
            self.ts, self.val = ts, val

    def merge(self, other):
        c = LWWRegister(self.node)
        if (other.ts, other.node) > (self.ts, self.node):
            c.ts, c.val = other.ts, other.val
        else:
            c.ts, c.val = self.ts, self.val
        return c
```

## 五、生产落地的三大工程护城河

在真实协同服务（如 Figma、Apple Notes、Redis Enterprise）中应用 CRDT，必须克服状态膨胀与时钟漂移风险。

### 1. 向量槽位爆炸与 Delta-CRDT

状态型 CRDT 的主要短板是向量长度与活跃节点数 \( N \) 严格成正比。若数百万手机端作为独立节点，单次心跳传输的向量体积将达到数兆字节。
工业界的解法是引入 Delta-State CRDT（如 \(\delta\)-CRDT）。节点只维护最近发生变化的增量切片，仅在对齐时发送增量；或采用两层分层架构，边缘客户端仅与就近的数据中心集群建立会话，由中心固定数量的协调者维护长生命周期槽位。

### 2. 物理时钟漂移对 LWW 的破坏

LWW 寄存器依赖系统时钟。如果某个节点的 NTP 时钟向前严重漂移，它写入的数据将拥有极高的时间戳，后续所有节点的正常写入都会被静默丢弃。
因此，关键业务字段的协同应优先采用 Lamport 逻辑时钟或因果向量时钟（Vector Clock），严禁裸用无保障的物理墙上时钟。

### 3. 垃圾回收与墓碑清理

在支持集合删除（ORSet）的复杂 CRDT 中，被删除的元素需要打上墓碑标记（Tombstone）。随着运行时间增长，墓碑占用的内存将远超真实数据。系统必须结合稳定版本检查点，在确认全网副本均已知悉删除事实后，批量回收墓碑内存。

## 六、验证实验与边界说明

本机制在 `experiments/crdt-gcounter/gcounter.py` 中完成了纯标准库仿真，7 项断言全部通过：
- C1：三节点并发自增，任意三种合并顺序最终求和均恒等于 23。
- C2：重复执行幂等合并，结果严格保持为 12。
- C3：单向自增跨副本单次合并可见。
- C4：PN-Counter 并发加减收敛值为 4。
- C5：减法向量多次重复合并无重复扣减。
- C6：LWW-Register 时间戳大者确定性胜出。
- C7：时间戳相同时由 node_id 稳定平局裁决。

边界说明：本实验证明了半格代数结构的数学收敛性。真实生产环境中仍需解决网络延迟、拜占庭恶意节点篡改以及长时间离线设备合并时的内存抖动问题。

## 参考资料

- Marc Shapiro et al., 2011. "Conflict-free Replicated Data Types", INRIA Research Report (<https://inria.hal.science/inria-00609399>)
- CRDT 规范与前沿学术资源：<https://crdt.tech/>
- Martin Kleppmann: "Designing Data-Intensive Applications", Chapter 5: Replication
- 站内对照：Gossip 传染动力学与反熵广播，`/writing/gossip-rounds-infection`
- 架构闭环：读己之写与会话一致性保障，`/writing/read-your-write-session`
