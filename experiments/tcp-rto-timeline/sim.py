#!/usr/bin/env python3
"""A small RFC 6298-style RTO/backoff timeline model."""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--srtt-ms", type=float, default=100.0)
    parser.add_argument("--rttvar-ms", type=float, default=20.0)
    parser.add_argument("--timeouts", type=int, default=3)
    args = parser.parse_args()

    rto = max(1.0, args.srtt_ms + 4 * args.rttvar_ms)
    print(
        f"srtt_ms={args.srtt_ms:.1f} rttvar_ms={args.rttvar_ms:.1f} "
        f"initial_rto_ms={rto:.1f}"
    )
    print("event attempt wait_ms next_rto_ms rtt_sample")
    for attempt in range(1, args.timeouts + 1):
        next_rto = rto * 2
        print(f"timeout {attempt:>7} {rto:>8.1f} {next_rto:>11.1f} discarded_by_karn")
        rto = next_rto
    print("fast_retransmit       3       0.0           - triggered_by_duplicate_ack")


if __name__ == "__main__":
    main()
