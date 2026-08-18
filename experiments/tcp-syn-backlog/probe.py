#!/usr/bin/env python3
"""Observe how many clients complete connect while the server never accepts.

This is a small local probe, not a portable formula for Linux SYN or accept
queue capacity. Kernel versions, syncookies, loopback behavior, and client
close timing all affect the result.
"""

from __future__ import annotations

import argparse
import platform
import socket
import threading
import time
from collections import Counter


def probe(*, backlog: int, clients: int, timeout: float, hold: float) -> Counter[str]:
    ready = threading.Event()
    release = threading.Event()
    address: list[tuple[str, int]] = []
    outcomes = ["not-started"] * clients
    sockets: list[socket.socket] = []
    sockets_lock = threading.Lock()

    def server() -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", 0))
            listener.listen(backlog)
            address.append(listener.getsockname())
            ready.set()
            release.wait(hold)

    server_thread = threading.Thread(target=server, name="backlog-server")
    server_thread.start()
    if not ready.wait(timeout=2):
        raise RuntimeError("server did not start")

    barrier = threading.Barrier(clients + 1)

    def client(index: int) -> None:
        barrier.wait()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            sock.connect(address[0])
        except TimeoutError:
            outcomes[index] = "timeout"
            sock.close()
        except OSError as exc:
            outcomes[index] = f"error:{exc.errno or 'unknown'}"
            sock.close()
        else:
            outcomes[index] = "connected"
            with sockets_lock:
                sockets.append(sock)

    client_threads = [threading.Thread(target=client, args=(i,)) for i in range(clients)]
    for thread in client_threads:
        thread.start()
    barrier.wait()
    for thread in client_threads:
        thread.join(timeout + 1)

    # Keep successful sockets alive until every connect attempt has completed;
    # otherwise a fast close can make the queue result depend on scheduling.
    time.sleep(0.05)
    with sockets_lock:
        for sock in sockets:
            sock.close()
    release.set()
    server_thread.join(hold + 1)
    return Counter(outcomes)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backlog", type=int, default=2)
    parser.add_argument("--clients", type=int, default=6)
    parser.add_argument("--timeout", type=float, default=0.5)
    parser.add_argument("--hold", type=float, default=1.0)
    args = parser.parse_args()
    result = probe(
        backlog=args.backlog,
        clients=args.clients,
        timeout=args.timeout,
        hold=args.hold,
    )
    print(
        f"platform={platform.system()} {platform.release()} "
        f"python={platform.python_version()}"
    )
    print(
        f"backlog={args.backlog} clients={args.clients} "
        f"timeout_s={args.timeout} hold_s={args.hold}"
    )
    print(
        f"connected={result['connected']} timeout={result['timeout']} "
        f"errors={sum(count for key, count in result.items() if key.startswith('error:'))}"
    )
    for outcome, count in sorted(result.items()):
        if outcome.startswith("error:"):
            print(f"{outcome}={count}")


if __name__ == "__main__":
    main()
