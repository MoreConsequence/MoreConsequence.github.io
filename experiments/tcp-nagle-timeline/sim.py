#!/usr/bin/env python3
"""A deterministic timing model for Nagle and delayed ACK interaction.

It models the causal timeline only. It does not open sockets and cannot prove
what a particular kernel, NIC, or network emulator will do.
"""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rtt-ms", type=float, default=100.0)
    parser.add_argument("--delayed-ack-ms", type=float, default=40.0)
    parser.add_argument("--messages", type=int, default=10)
    args = parser.parse_args()

    one_way = args.rtt_ms / 2
    first_arrival = one_way
    ack_at_client = one_way + args.delayed_ack_ms + one_way
    nagle_last_arrival = ack_at_client + one_way
    print(
        f"rtt_ms={args.rtt_ms:.1f} delayed_ack_ms={args.delayed_ack_ms:.1f} "
        f"messages={args.messages}"
    )
    print("mode segments first_arrival_ms last_arrival_ms spread_ms")
    print(
        f"nagle {2:>8} {first_arrival:>17.1f} {nagle_last_arrival:>16.1f} "
        f"{nagle_last_arrival - first_arrival:>10.1f}"
    )
    print(
        f"nodelay {args.messages:>6} {first_arrival:>17.1f} {first_arrival:>16.1f} "
        f"{0.0:>10.1f}"
    )


if __name__ == "__main__":
    main()
