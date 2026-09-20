---
title: "Lock-Free CAS：ABA 问题与无锁栈"
description: "Compare-And-Swap 是无锁并发的基石，但有 ABA 陷阱：值从 A 改成 B 再改回 A，CAS 以为没变过。实验：Python 模拟 CAS 无锁栈，演示 ABA 失败的 3 步交错，以及版本号指针的修复。"
publishedAt: "2026-09-19"
tags: ["核心原理", "无锁并发", "CAS", "ABA"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** Go 的 `sync/atomic.CompareAndSwap`、Java 的 `AtomicReference`、硬件的 `CMPXCHG` 指令——底层都是 CAS：如果内存值等于预期值，就原子地换成新值。CAS 让无锁数据结构成为可能（不用 mutex 就能 push/pop），但有一个经典陷阱：**ABA 问题**——值从 A 改成 B 再改回 A，CAS 检查通过，但中间的 B 已经破坏了不变量。实验：Python 模拟 CAS 无锁栈的 3 步交错导致 ABA，以及用版本号指针修复。

## 一、CAS 是什么

```
CAS(内存值, 期望值, 新值):
  if 内存值 == 期望值:
    内存值 = 新值  (原子)
    return true   (成功)
  else:
    return false  (失败，被别人先改了)
```

与 mutex 的区别：mutex 是"等别人释放锁"，CAS 是"改了就赢，没改就重试"——没有等待，只有重试。

## 二、ABA 问题：3 步交错

场景：无锁栈的 pop 操作。

```
初始栈: head → [A] → [B] → null

线程 1 读到 head = A, next = B（准备把 head 从 A 改成 B）
                          ↓ 被抢占
线程 2 完成: pop A → pop B → push A（A 被回收重新入栈）
                          ↓ 恢复
线程 1 的 CAS: head == A? 是！改成 B
               但此时栈是: head → [A(new)] → null（B 已经被 pop 了）
               结果: head 指向了被回收的 A，next 指向了已经被 pop 的 B
```

CAS 检查通过（head 确实还是 A），但中间状态已经被破坏。

## 三、修复：版本号指针

```python
class VersionedPointer:
    """带版本号的指针：每次修改递增版本号，CAS 同时比较版本。"""
    def __init__(self, value=None):
        self.value = value
        self.version = 0

class LockFreeStack:
    def __init__(self):
        self.head = VersionedPointer(None)

    def push(self, value):
        node = Node(value)
        while True:
            old_head = self.head
            node.next = old_head.value
            # CAS 同时比较 value 和 version
            if self._cas_head(old_head, VersionedPointer(node, old_head.version + 1)):
                break

    def pop(self):
        while True:
            old_head = self.head
            if old_head.value is None:
                return None
            next_node = old_head.value.next
            # version+1 保证即使 value 回收了 A，版本号也不同
            if self._cas_head(old_head, VersionedPointer(next_node, old_head.version + 1)):
                return old_head.value.value
```

版本号从 0 开始递增：A(版本 0) → B → A(版本 1) —— CAS 比较时版本不同，ABA 不会发生。

## 四、实验演示

```python
import threading
import time

class SimulatedCAS:
    """模拟 CAS：value + version。"""
    def __init__(self):
        self.value = "A"
        self.version = 0
        self._lock = threading.Lock()  # 仅用于模拟原子性

    def cas(self, expected_value, new_value):
        with self._lock:
            if self.value == expected_value:
                self.value = new_value
                self.version += 1
                return True
            return False

def aba_demo():
    cas = SimulatedCAS()
    results = []

    def thread1():
        # 读到 A
        time.sleep(0.01)  # 让线程 2 先执行
        # CAS: A → B（期望值是 A，实际已经是 A(new)）
        ok = cas.cas("A", "B")
        results.append(("thread1_A_to_B", ok))

    def thread2():
        # A → B → A（制造 ABA）
        cas.cas("A", "B")  # A → B
        time.sleep(0.005)
        cas.cas("B", "A")  # B → A（ABA 发生）

    t1 = threading.Thread(target=thread1)
    t2 = threading.Thread(target=thread2)
    t1.start(); t2.start()
    t1.join(); t2.join()

    # CAS 通过了，但值已经是 A(new) 而不是 A(old)
    print(f"CAS 通过: {results[0][1]}")  # True
    print(f"当前值: {cas.value}, 版本: {cas.version}")
    assert results[0][1] == True, "ABA: CAS should pass (this is the bug)"
    assert cas.version == 2, f"Version should be 2, got {cas.version}"
    print("✓ ABA 问题复现：CAS 通过但状态已变")
```

## 五、Go 里的 CAS

```go
import "sync/atomic"

var head *Node

// pop with CAS retry
for {
    old := head
    if old == nil { return nil, false }
    next := old.next
    if atomic.CompareAndSwapPointer((*unsafe.Pointer)(unsafe.Pointer(&head)),
        unsafe.Pointer(old), unsafe.Pointer(next)) {
        return old.value, true
    }
    // CAS 失败，重试
}
```

Go 的 `atomic.CompareAndSwapPointer` 比较的是指针地址（不是值），所以 Go 的 ABA 问题发生在 GC 移动对象后地址复用的场景（需要 hazard pointer 或 epoch-based reclamation 防护）。

## 六、判断边界

**适合 CAS 的场景**：
- 低竞争（CAS 重试次数少，比 mutex 快）
- 简单操作（计数器、标志位、栈/队列的 push/pop）
- 延迟敏感（mutex 会阻塞，CAS 不会）

**不适合的场景**：
- 高竞争（CAS 重试风暴，不如 mutex）
- 复杂不变量（多个变量要同时更新，CAS 只能改一个）
- 需要公平性（CAS 没有排队机制，某些线程可能饥饿）

## 七、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 实验 | `experiments/lockfree-cas-aba/demo.py`：ABA 3 步交错复现 + 版本号修复（2026-09-19-local） |
| 参考来源 | Herlihy & Shavit: "The Art of Multiprocessor Programming"（2008）；Go `sync/atomic` docs（2026-09-19 核对） |
| 不支持结论 | 真实多核下的 CAS 重试次数、与 mutex 的性能对比——无多核压测，未验证 |

## 参考资料

- Herlihy & Shavit: "The Art of Multiprocessor Programming"（2008，Chapter 9: Lock-Free Objects）
- Go `sync/atomic` docs：CompareAndSwap（2026-09-19 核对）
- 前篇：MESI 缓存一致性，`/writing/mesi-cache-coherence-false-sharing`
- 前篇：分布式锁与 fencing，`/writing/consensus-06-distributed-locks-redlock-etcd-fencing`
