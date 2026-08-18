"""A small, deterministic model of kube-scheduler resource scoring.

This is not kube-scheduler. It isolates the resource formulas used to explain
LeastAllocated, MostAllocated, BalancedAllocation, and feasible-node sampling.
"""

from dataclasses import dataclass


CPU_CAPACITY = 8.0
MEMORY_CAPACITY_GIB = 16.0
POD_CPU = 1.0
POD_MEMORY_GIB = 2.0


@dataclass(frozen=True)
class Node:
    name: str
    cpu_used: float
    memory_used_gib: float


NODES = (
    Node("n1", 4, 4),
    Node("n2", 2, 12),
    Node("n3", 7, 6),
    Node("n4", 3, 8),
)


def cpu_after(node: Node) -> float:
    return (node.cpu_used + POD_CPU) / CPU_CAPACITY


def memory_after(node: Node) -> float:
    return (node.memory_used_gib + POD_MEMORY_GIB) / MEMORY_CAPACITY_GIB


def feasible(node: Node) -> bool:
    return cpu_after(node) <= 1 and memory_after(node) <= 1


def least_allocated(node: Node) -> int:
    """Score remaining capacity; the higher score is preferred."""

    return int(((1 - cpu_after(node)) + (1 - memory_after(node))) * 50)


def most_allocated(node: Node) -> int:
    """Score used capacity; this is a packing preference."""

    return int((cpu_after(node) + memory_after(node)) * 50)


def balanced_allocation(node: Node) -> int:
    """Prefer nodes whose CPU and memory utilization stay close."""

    return int((1 - abs(cpu_after(node) - memory_after(node)) / 2) * 100)


def feasible_nodes_to_score(node_count: int) -> int:
    """Model the v1.33 numFeasibleNodesToFind sampling formula."""

    percentage = max(5.0, 50.0 - node_count / 125.0)
    return min(node_count, max(100, int(node_count * percentage / 100)))


def main() -> None:
    print(
        "model=resource-scoring-v1.33-like "
        f"capacity_cpu={CPU_CAPACITY:g} capacity_memory_gib={MEMORY_CAPACITY_GIB:g} "
        f"pod_cpu={POD_CPU:g} pod_memory_gib={POD_MEMORY_GIB:g}"
    )
    print("node feasible least most balanced")
    scores = []
    for node in NODES:
        row = (
            node.name,
            feasible(node),
            least_allocated(node),
            most_allocated(node),
            balanced_allocation(node),
        )
        scores.append(row)
        print(f"{row[0]} {str(row[1]).lower():>8} {row[2]:>5} {row[3]:>4} {row[4]:>8}")

    winners = {
        "least": max(scores, key=lambda row: row[2])[0],
        "most": max(scores, key=lambda row: row[3])[0],
        "balanced": max(scores, key=lambda row: row[4])[0],
    }
    print("winners=" + " ".join(f"{key}:{value}" for key, value in winners.items()))

    print("sampling node_count scored_nodes percentage")
    for node_count in (50, 100, 200, 1000, 5000):
        percentage = max(5.0, 50.0 - node_count / 125.0)
        print(
            f"{node_count:>12} {feasible_nodes_to_score(node_count):>12} "
            f"{percentage:>10.2f}%"
        )


if __name__ == "__main__":
    main()
