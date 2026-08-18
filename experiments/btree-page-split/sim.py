#!/usr/bin/env python3
"""Deterministic leaf-page split model for the B+Tree article.

The model keeps sorted keys in leaf pages and compares append-friendly
inserts with random inserts that split a full leaf in the middle. Internal
page counts are a fan-out estimate, not an InnoDB implementation.
"""

from __future__ import annotations

import argparse
import bisect
import random
from dataclasses import dataclass


@dataclass
class Result:
    page_size: int
    mode: str
    capacity: int
    leaf_pages: int
    internal_pages: int
    total_pages: int
    fill_ratio: float
    leaf_splits: int


def internal_page_count(leaf_pages: int, fanout: int) -> int:
    level = leaf_pages
    total = 0
    while level > 1:
        level = (level + fanout - 1) // fanout
        total += level
    return total


def simulate(*, page_size: int, rows: int, row_bytes: int, mode: str, seed: int) -> Result:
    capacity = page_size // row_bytes
    leaves: list[list[int]] = [[]]
    maxima: list[int] = []
    keys = list(range(rows))
    if mode == "random":
        random.Random(seed).shuffle(keys)

    for key in keys:
        if mode == "sequential":
            leaf = leaves[-1]
            if len(leaf) == capacity:
                leaves.append([])
                leaf = leaves[-1]
            leaf.append(key)
            continue

        index = bisect.bisect_left(maxima, key)
        if index == len(leaves):
            index -= 1
        leaf = leaves[index]
        bisect.insort(leaf, key)
        if len(leaf) <= capacity:
            if maxima:
                maxima[index] = leaf[-1]
            else:
                maxima.append(leaf[-1])
            continue

        middle = len(leaf) // 2
        left = leaf[:middle]
        right = leaf[middle:]
        leaves[index:index + 1] = [left, right]
        maxima[index:index + 1] = [left[-1], right[-1]]

    if mode == "sequential":
        maxima = [leaf[-1] for leaf in leaves if leaf]

    fanout = max(4, capacity * 3 // 4)
    internal_pages = internal_page_count(len(leaves), fanout)
    return Result(
        page_size=page_size,
        mode=mode,
        capacity=capacity,
        leaf_pages=len(leaves),
        internal_pages=internal_pages,
        total_pages=len(leaves) + internal_pages,
        fill_ratio=rows / (len(leaves) * capacity),
        leaf_splits=max(0, len(leaves) - 1),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=200_000)
    parser.add_argument("--row-bytes", type=int, default=128)
    parser.add_argument("--seed", type=int, default=20260817)
    args = parser.parse_args()

    print(f"rows={args.rows} row_bytes={args.row_bytes} seed={args.seed}")
    print("page_size mode capacity leaf_pages internal_pages total_pages fill_ratio leaf_splits")
    for page_size in (4096, 8192, 16384):
        for mode in ("sequential", "random"):
            result = simulate(
                page_size=page_size,
                rows=args.rows,
                row_bytes=args.row_bytes,
                mode=mode,
                seed=args.seed,
            )
            print(
                f"{result.page_size:>9} {result.mode:>10} {result.capacity:>8} "
                f"{result.leaf_pages:>10} {result.internal_pages:>13} "
                f"{result.total_pages:>11} {result.fill_ratio:>10.4%} "
                f"{result.leaf_splits:>11}"
            )


if __name__ == "__main__":
    main()
