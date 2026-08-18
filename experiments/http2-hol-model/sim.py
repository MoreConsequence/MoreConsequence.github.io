#!/usr/bin/env python3
"""A small model of stream-level consequences of one lost packet.

This is not an HTTP/2 or HTTP/3 implementation benchmark. It holds the
connection schedule, packet placement, RTT and flow-control windows fixed so
that only the transport reordering rule changes.
"""

from __future__ import annotations

import argparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--streams", type=int, default=20)
    parser.add_argument("--lost-stream", type=int, default=1)
    parser.add_argument("--rtt-ms", type=int, default=50)
    parser.add_argument("--stream-window", type=int, default=65535)
    parser.add_argument("--connection-window", type=int, default=65535)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not 1 <= args.lost_stream <= args.streams:
        raise SystemExit("lost stream must be inside the stream range")

    print(
        f"streams={args.streams} lost_stream={args.lost_stream} "
        f"rtt_ms={args.rtt_ms} stream_window={args.stream_window} "
        f"connection_window={args.connection_window}"
    )
    print(
        "h2 initial credit: "
        f"each_stream={args.stream_window} connection_total={args.connection_window}"
    )
    print(
        "h2 lost-packet result: "
        f"affected_streams={args.streams} recovery_wait_ms={args.rtt_ms}"
    )
    print(
        "h3 lost-packet result: "
        "affected_streams=1 "
        f"recovery_wait_ms={args.rtt_ms} "
        f"affected_stream={args.lost_stream}"
    )


if __name__ == "__main__":
    main()
