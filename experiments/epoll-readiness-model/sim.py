#!/usr/bin/env python3
"""Count the work represented by a readiness-dispatch complexity model.

This is not a syscall or kernel benchmark. It isolates the difference between
scanning every registered connection and consuming only ready events.
"""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--connections", default="100,10000")
    parser.add_argument("--ready", type=int, default=10)
    parser.add_argument("--wait-calls", type=int, default=1000)
    args = parser.parse_args()

    connections = [int(value) for value in args.connections.split(",")]
    print(f"ready={args.ready} wait_calls={args.wait_calls}")
    print("connections scan_checks ready_events scan_to_ready_ratio")
    for count in connections:
        scan_checks = count * args.wait_calls
        ready_events = args.ready * args.wait_calls
        ratio = scan_checks / ready_events if ready_events else float("inf")
        print(f"{count:>11} {scan_checks:>11} {ready_events:>12} {ratio:>20.1f}x")


if __name__ == "__main__":
    main()
