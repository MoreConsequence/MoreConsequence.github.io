#!/usr/bin/env python3
"""Compare modulo assignment with a deterministic consistent-hash ring."""

from hashlib import md5

KEY_COUNT = 100_000


def hash_value(value: str) -> int:
    return int(md5(value.encode("utf-8")).hexdigest()[:8], 16)


def locate(key: str, ring: list[tuple[int, str]]) -> str:
    value = hash_value(key)
    for position, node in ring:
        if position >= value:
            return node
    return ring[0][1]


def modulo_locate(key: str, nodes: list[str]) -> str:
    return nodes[hash_value(key) % len(nodes)]


def main() -> None:
    keys = [f"key-{index:06d}" for index in range(KEY_COUNT)]
    old_nodes = ["N0", "N1", "N2"]
    new_nodes = [*old_nodes, "N3"]
    old_ring = sorted((hash_value(node), node) for node in old_nodes)
    new_ring = sorted((hash_value(node), node) for node in new_nodes)

    ring_moved = sum(locate(key, old_ring) != locate(key, new_ring) for key in keys)
    modulo_moved = sum(
        modulo_locate(key, old_nodes) != modulo_locate(key, new_nodes) for key in keys
    )

    print(f"keys={KEY_COUNT}")
    print(f"ring_moved={ring_moved} ratio={ring_moved / KEY_COUNT:.4%}")
    print(f"modulo_moved={modulo_moved} ratio={modulo_moved / KEY_COUNT:.4%}")
    print(f"ring_positions={new_ring}")


if __name__ == "__main__":
    main()
