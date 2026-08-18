#!/usr/bin/env python3
"""Deterministic queueing model for a bounded connection pool.

This is a teaching model, not a database or socket benchmark. Arrivals and
service times are exponential, requests are assigned to the earliest free
connection, and a request fails when its predicted wait exceeds the acquire
timeout. The seed and all parameters are printed so the tables are rerunnable.
"""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass


@dataclass
class Result:
    pool: int
    arrivals: int
    completed: int
    failed: int
    mean_wait_ms: float
    p50_wait_ms: float
    p99_wait_ms: float
    failure_rate: float
    offered_utilization: float


def quantile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int((len(ordered) - 1) * fraction))
    return ordered[index]


def simulate(
    *, rate: float, mean_service_s: float, pool: int, timeout_s: float,
    duration_s: float, seed: int,
) -> Result:
    rng = random.Random(seed)
    next_free = [0.0] * pool
    waits: list[float] = []
    arrivals = 0
    failed = 0
    service_seconds = 0.0
    now = 0.0

    while True:
        now += rng.expovariate(rate)
        if now > duration_s:
            break
        arrivals += 1
        server = min(range(pool), key=next_free.__getitem__)
        start = max(now, next_free[server])
        wait = start - now
        service = rng.expovariate(1.0 / mean_service_s)
        if wait > timeout_s:
            failed += 1
            continue
        next_free[server] = start + service
        waits.append(wait)
        service_seconds += service

    completed = len(waits)
    return Result(
        pool=pool,
        arrivals=arrivals,
        completed=completed,
        failed=failed,
        mean_wait_ms=(sum(waits) / completed * 1000.0) if completed else 0.0,
        p50_wait_ms=quantile(waits, 0.50) * 1000.0,
        p99_wait_ms=quantile(waits, 0.99) * 1000.0,
        failure_rate=(failed / arrivals) if arrivals else 0.0,
        offered_utilization=service_seconds / (pool * duration_s),
    )


def print_scenario(
    *, rate: float, mean_service_ms: float, timeout_ms: float,
    duration_s: float, pools: list[int], seed: int,
) -> None:
    print(
        f"== rate={rate:g}/s service={mean_service_ms:g}ms "
        f"timeout={timeout_ms:g}ms duration={duration_s:g}s seed={seed} =="
    )
    print("pool arrivals completed failed mean_wait_ms p50_wait_ms p99_wait_ms failure_rate utilization")
    for pool in pools:
        result = simulate(
            rate=rate,
            mean_service_s=mean_service_ms / 1000.0,
            pool=pool,
            timeout_s=timeout_ms / 1000.0,
            duration_s=duration_s,
            seed=seed,
        )
        print(
            f"{result.pool:>4} {result.arrivals:>8} {result.completed:>9} "
            f"{result.failed:>6} {result.mean_wait_ms:>13.3f} "
            f"{result.p50_wait_ms:>11.3f} {result.p99_wait_ms:>11.3f} "
            f"{result.failure_rate:>12.4%} {result.offered_utilization:>11.3%}"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=60.0)
    parser.add_argument("--seed", type=int, default=20260817)
    args = parser.parse_args()
    print_scenario(
        rate=20.0,
        mean_service_ms=40.0,
        timeout_ms=500.0,
        duration_s=args.duration,
        pools=[1, 2, 4, 8, 16],
        seed=args.seed,
    )
    print_scenario(
        rate=40.0,
        mean_service_ms=80.0,
        timeout_ms=300.0,
        duration_s=args.duration,
        pools=[4, 8, 16, 32],
        seed=args.seed + 1,
    )


if __name__ == "__main__":
    main()
