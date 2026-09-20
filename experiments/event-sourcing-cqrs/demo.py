#!/usr/bin/env python3
"""Event Sourcing & CQRS: append-only log with snapshot optimization."""

import sqlite3
import json
import time


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
    conn.execute(
        "INSERT INTO events (aggregate_id, event_type, payload, timestamp) VALUES (?, ?, ?, ?)",
        (agg_id, event_type, json.dumps(payload), time.time()),
    )
    conn.commit()


def rebuild_balance(conn, agg_id):
    cursor = conn.execute(
        "SELECT event_type, payload FROM events WHERE aggregate_id = ? ORDER BY id",
        (agg_id,),
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
    snap = conn.execute(
        "SELECT balance, last_event_id FROM snapshots WHERE aggregate_id = ?",
        (agg_id,),
    ).fetchone()

    if snap:
        balance, last_id = snap
        cursor = conn.execute(
            "SELECT event_type, payload FROM events WHERE aggregate_id = ? AND id > ? ORDER BY id",
            (agg_id, last_id),
        )
    else:
        balance = 0.0
        cursor = conn.execute(
            "SELECT event_type, payload FROM events WHERE aggregate_id = ? ORDER BY id",
            (agg_id,),
        )

    for row in cursor:
        event_type, payload_json = row
        payload = json.loads(payload_json)
        if event_type == "Deposit":
            balance += payload["amount"]
        elif event_type == "Withdraw":
            balance -= payload["amount"]
    return balance


def main():
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
    print(f"当前余额: {balance}")

    # 时间旅行：第 3 笔交易后
    cursor = conn.execute(
        "SELECT event_type, payload FROM events WHERE aggregate_id = ? ORDER BY id LIMIT 3",
        ("acc-1",),
    )
    travel_balance = 0.0
    for row in cursor:
        et, pj = row
        p = json.loads(pj)
        if et == "Deposit":
            travel_balance += p["amount"]
        elif et == "Withdraw":
            travel_balance -= p["amount"]
    print(f"第 3 笔后余额 (时间旅行): {travel_balance}")

    # 快照 + 重建
    conn.execute(
        "INSERT OR REPLACE INTO snapshots (aggregate_id, balance, last_event_id) VALUES (?, ?, ?)",
        ("acc-1", travel_balance, 3),
    )
    snap_balance = rebuild_with_snapshot(conn, "acc-1")
    print(f"快照后重建余额: {snap_balance}")

    assert balance == 230, f"Expected 230, got {balance}"
    assert travel_balance == 120, f"Expected 120, got {travel_balance}"
    assert snap_balance == 230, f"Expected 230, got {snap_balance}"
    print("✓ All assertions passed")


if __name__ == "__main__":
    main()
