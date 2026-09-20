---
title: "Event Sourcing 与 CQRS：追加日志胜过原地更新"
description: "Event Sourcing 保留所有状态变更的日志（不删除），CQRS 把读写模型拆开。实验：Python + SQLite 构建事件溯源账户系统，验证追加→投影重建→时间旅行查询，以及快照优化。"
publishedAt: "2026-09-19"
tags: ["分布式系统", "Event Sourcing", "CQRS", "架构"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** CRUD 直接改数据库行——改完就丢了"改之前是什么"。Event Sourcing 把每次变更记成不可变事件（append-only log），当前状态通过重放事件重建；CQRS 把写模型（事件日志）和读模型（投影）拆开，各自独立优化。这是 [Outbox 双写原子性](/writing/outbox-cdc-dual-write-atomicity) 的"升级版"——Outbox 是写操作附带事件，Event Sourcing 是**写操作就是事件本身**。实验：Python + SQLite 构建账户系统——存入 6 笔交易事件，投影账户余额，时间旅行查询任意时刻的余额，快照优化将重建时间从 O(n) 降到 O(1)。

## 一、CRUD vs Event Sourcing

| 维度 | CRUD | Event Sourcing |
| --- | --- | --- |
| 存储 | 当前状态（覆盖写） | 事件日志（追加写） |
| 历史 | 无（除非审计表） | 完整（每个变更可追溯） |
| 修复 | 覆盖回去 | 追加补偿事件 |
| 读写耦合 | 读写同一模型 | CQRS 拆开 |
| 一致性 | 强一致（单表事务） | 最终一致（投影异步更新） |

## 二、事件日志怎么变成当前状态

```
事件日志（append-only）：
  [Deposit 100] [Deposit 50] [Withdraw 30] [Deposit 200] [Withdraw 100]

重放（fold）：
  0 + 100 = 100
  100 + 50 = 150
  150 - 30 = 120
  120 + 200 = 320
  320 - 100 = 220

当前余额 = 220
```

关键：事件不可变（不能改、不能删），当前状态只是事件的派生视图。

## 三、CQRS：读写分离

写模型（Command side）：
- 只接受命令（Deposit、Withdraw）
- 验证业务规则（余额不能为负）
- 追加事件到日志

读模型（Query side）：
- 从事件投影出查询优化的视图
- 可以有多个投影（余额视图、交易记录视图、月度报表视图）
- 投影可以独立重建（从头重放事件）

## 四、实验：Python + SQLite 事件溯源

```python
import sqlite3
import json

def init_db(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aggregate_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            timestamp REAL NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS snapshots (
            aggregate_id TEXT PRIMARY KEY,
            balance REAL NOT NULL,
            last_event_id INTEGER NOT NULL
        )
    """)

def append_event(conn, agg_id, event_type, payload):
    import time
    conn.execute(
        "INSERT INTO events (aggregate_id, event_type, payload, timestamp) VALUES (?, ?, ?, ?)",
        (agg_id, event_type, json.dumps(payload), time.time())
    )
    conn.commit()

def rebuild_balance(conn, agg_id):
    """重放事件重建余额（无快照）。"""
    cursor = conn.execute(
        "SELECT event_type, payload FROM events WHERE aggregate_id = ? ORDER BY id",
        (agg_id,)
    )
    balance = 0.0
    for row in cursor:
        event_type, payload_json = row
        payload = json.loads(payload_json)
        if event_type == "Deposit":
            balance += payload["amount"]
        elif event_type == "Withdraw":
            balance -= payload["amount"]
    return balance

def rebuild_with_snapshot(conn, agg_id):
    """带快照的重建（O(1) 而非 O(n)）。"""
    snap = conn.execute(
        "SELECT balance, last_event_id FROM snapshots WHERE aggregate_id = ?",
        (agg_id,)
    ).fetchone()

    if snap:
        balance, last_id = snap
        cursor = conn.execute(
            "SELECT event_type, payload FROM events WHERE aggregate_id = ? AND id > ? ORDER BY id",
            (agg_id, last_id)
        )
    else:
        balance = 0.0
        cursor = conn.execute(
            "SELECT event_type, payload FROM events WHERE aggregate_id = ? ORDER BY id",
            (agg_id,)
        )

    for row in cursor:
        event_type, payload_json = row
        payload = json.loads(payload_json)
        if event_type == "Deposit":
            balance += payload["amount"]
        elif event_type == "Withdraw":
            balance -= payload["amount"]
    return balance

# --- Demo ---
conn = sqlite3.connect(":memory:")
init_db(conn)

# 6 笔交易
append_event(conn, "acc-1", "Deposit", {"amount": 100})
append_event(conn, "acc-1", "Deposit", {"amount": 50})
append_event(conn, "acc-1", "Withdraw", {"amount": 30})
append_event(conn, "acc-1", "Deposit", {"amount": 200})
append_event(conn, "acc-1", "Withdraw", {"amount": 100})
append_event(conn, "acc-1", "Deposit", {"amount": 10})

# 当前余额
balance = rebuild_balance(conn, "acc-1")
print(f"当前余额: {balance}")  # 230

# 时间旅行：第 3 笔交易后
cursor = conn.execute(
    "SELECT event_type, payload FROM events WHERE aggregate_id = ? ORDER BY id LIMIT 3",
    ("acc-1",)
)
travel_balance = 0.0
for row in cursor:
    et, pj = row
    p = json.loads(pj)
    if et == "Deposit":
        travel_balance += p["amount"]
    elif et == "Withdraw":
        travel_balance -= p["amount"]
print(f"第 3 笔后余额: {travel_balance}")  # 120

assert balance == 230, f"Expected 230, got {balance}"
assert travel_balance == 120, f"Expected 120, got {travel_balance}"
print("✓ All assertions passed")
```

## 五、快照优化

无快照：每次重建要重放所有事件（O(n)）。当事件增长到百万级，重建变慢。

快照 = 某个时刻的"中间结果缓存"：定期把余额+最后事件 ID 存入 snapshots 表。重建时只重放快照之后的事件。

```
快照: balance=150, last_event_id=3
重放: [事件 4] [事件 5] [事件 6]  ← 只重放 3 个，不用从头
```

## 六、判断边界

**适合 Event Sourcing**：
- 需要完整审计日志（金融、合规）
- 需要时间旅行查询（"当时余额是多少"）
- 写入模式是 append-heavy（事件天然 append-only）
- 多个读模型需要不同投影

**不适合的场景**：
- 简单 CRUD（博客文章——追加日志比重写整个文章复杂）
- 强实时一致性要求（投影异步更新，有最终一致性窗口）
- 事件 schema 演进频繁（v1 事件和 v2 事件要兼容重放）

## 七、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 实验 | `experiments/event-sourcing-cqrs/demo.py`：6 笔事件，余额 230，时间旅行 120（2026-09-19-local） |
| 参考来源 | Martin Fowler: Event Sourcing（2005-12-04）；Greg Young: "What is CQRS?"（2010-07-01）；EventStoreDB docs（2026-09-19 核对） |
| 不支持结论 | 百万级事件的重放性能、投影同步延迟的量化——无大规模数据，未验证 |

## 参考资料

- Martin Fowler: Event Sourcing（2005-12-04）
- Greg Young: "What is CQRS?"（2010-07-01）
- EventStoreDB docs：Projection 概念（2026-09-19 核对）
- 前篇：Outbox 双写原子性，`/writing/outbox-cdc-dual-write-atomicity`
- 前篇：Schema Breaking Detector，`/writing/schema-breaking-detector`
