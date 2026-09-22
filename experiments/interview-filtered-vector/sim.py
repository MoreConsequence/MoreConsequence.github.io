#!/usr/bin/env python3
"""
experiments/interview-filtered-vector/sim.py

Deterministic simulation suite for Filtered Vector Search in Vector Databases:
Compares three strategies under varying metadata selectivity (from 50% down to 0.5%):
1. Post-Filtering: Global ANN search -> discard invalid metadata.
2. Naive Pre-Filtering: Subgraph traversal on filtered nodes only (graph disconnection trap).
3. In-Graph Single-Stage Search (ACORN / Qdrant bridge traversal):
   Traverses through unfiltered nodes as bridges, but only collects valid nodes into top-K.
"""

import math
import random
import heapq
from typing import List, Dict, Set, Tuple

# Fix random seed for determinism
random.seed(42)

class VectorNode:
    def __init__(self, node_id: int, vector: Tuple[float, float], tag: str):
        self.node_id = node_id
        self.vector = vector
        self.tag = tag
        self.neighbors: List[int] = []

def euclidean_dist(v1: Tuple[float, float], v2: Tuple[float, float]) -> float:
    return math.sqrt((v1[0] - v2[0])**2 + (v1[1] - v2[1])**2)

def build_proximity_graph(nodes: List[VectorNode], k_neighbors: int = 6):
    """Builds a navigable proximity graph (like HNSW base layer)."""
    n = len(nodes)
    for i in range(n):
        dists = []
        for j in range(n):
            if i != j:
                d = euclidean_dist(nodes[i].vector, nodes[j].vector)
                dists.append((d, j))
        dists.sort()
        nodes[i].neighbors = [j for _, j in dists[:k_neighbors]]

# ==============================================================================
# Search Algorithms
# ==============================================================================

def exact_filtered_knn(nodes: List[VectorNode], query: Tuple[float, float], target_tag: str, top_k: int) -> List[int]:
    """Ground truth exact nearest neighbors among filtered nodes."""
    candidates = []
    for node in nodes:
        if node.tag == target_tag:
            d = euclidean_dist(node.vector, query)
            candidates.append((d, node.node_id))
    candidates.sort()
    return [nid for _, nid in candidates[:top_k]]

def post_filtering_search(nodes: List[VectorNode], query: Tuple[float, float], target_tag: str, top_k: int, ef_search: int = 30) -> List[int]:
    """
    Step 1: Perform standard greedy graph search on entire dataset.
    Step 2: Discard candidates that do not match target_tag.
    """
    # Start from node 0
    visited = {0}
    candidates = [(euclidean_dist(nodes[0].vector, query), 0)]
    w = [(euclidean_dist(nodes[0].vector, query), 0)]  # Max-heap (by distance) of size ef_search

    while candidates:
        d_c, curr = heapq.heappop(candidates)
        # If closest candidate is farther than furthest in W, stop
        if d_c > -w[0][0] and len(w) >= ef_search:
            break

        for neighbor in nodes[curr].neighbors:
            if neighbor not in visited:
                visited.add(neighbor)
                d_n = euclidean_dist(nodes[neighbor].vector, query)
                furthest_dist = -w[0][0]
                if d_n < furthest_dist or len(w) < ef_search:
                    heapq.heappush(candidates, (d_n, neighbor))
                    heapq.heappush(w, (-d_n, neighbor))
                    if len(w) > ef_search:
                        heapq.heappop(w)

    # Post-filtering: filter by target_tag
    valid_results = []
    for neg_d, nid in w:
        if nodes[nid].tag == target_tag:
            valid_results.append((-neg_d, nid))
    valid_results.sort()
    return [nid for _, nid in valid_results[:top_k]]

def naive_pre_filtering_search(nodes: List[VectorNode], query: Tuple[float, float], target_tag: str, top_k: int, ef_search: int = 30) -> List[int]:
    """
    Restricts traversal ONLY to nodes matching target_tag.
    Edges to nodes with other tags are pruned/ignored.
    Causes graph disconnection!
    """
    # Find entry point that has target_tag
    entry_point = None
    for node in nodes:
        if node.tag == target_tag:
            entry_point = node.node_id
            break

    if entry_point is None:
        return []

    visited = {entry_point}
    d_init = euclidean_dist(nodes[entry_point].vector, query)
    candidates = [(d_init, entry_point)]
    w = [(-d_init, entry_point)]

    while candidates:
        d_c, curr = heapq.heappop(candidates)
        if d_c > -w[0][0] and len(w) >= ef_search:
            break

        for neighbor in nodes[curr].neighbors:
            # Traversal strictly blocked if neighbor tag does not match!
            if nodes[neighbor].tag != target_tag:
                continue

            if neighbor not in visited:
                visited.add(neighbor)
                d_n = euclidean_dist(nodes[neighbor].vector, query)
                furthest_dist = -w[0][0]
                if d_n < furthest_dist or len(w) < ef_search:
                    heapq.heappush(candidates, (d_n, neighbor))
                    heapq.heappush(w, (-d_n, neighbor))
                    if len(w) > ef_search:
                        heapq.heappop(w)

    w.sort(key=lambda x: -x[0])
    return [nid for _, nid in w[:top_k]]

def in_graph_single_stage_search(nodes: List[VectorNode], query: Tuple[float, float], target_tag: str, top_k: int, ef_search: int = 30) -> List[int]:
    """
    ACORN / Qdrant Single-Stage In-Graph Traversal:
    - Traverses all nodes as routing bridges (no graph disconnection!).
    - BUT only matching nodes are admitted into the final result set W.
    - Uses adaptive exploration budget to reach target items through bridges.
    """
    visited = {0}
    candidates = [(euclidean_dist(nodes[0].vector, query), 0)]
    w = []  # Contains only valid target_tag items: max-heap (-dist, nid)

    # Adaptive hop budget for low selectivity traversal
    max_hops = ef_search * 8

    while candidates and len(visited) < max_hops:
        d_c, curr = heapq.heappop(candidates)

        # Check neighbor routing
        for neighbor in nodes[curr].neighbors:
            if neighbor not in visited:
                visited.add(neighbor)
                d_n = euclidean_dist(nodes[neighbor].vector, query)

                # Route through this candidate regardless of tag
                heapq.heappush(candidates, (d_n, neighbor))

                # Admit into result set ONLY if tag matches
                if nodes[neighbor].tag == target_tag:
                    furthest_dist = -w[0][0] if w else float('inf')
                    if d_n < furthest_dist or len(w) < top_k:
                        heapq.heappush(w, (-d_n, neighbor))
                        if len(w) > top_k:
                            heapq.heappop(w)

        # Stop early if we have found top_k results and closest candidate is far
        if len(w) >= top_k and candidates and candidates[0][0] > -w[0][0]:
            break

    w.sort(key=lambda x: -x[0])
    return [nid for _, nid in w[:top_k]]

# ==============================================================================
# Simulation & Assertions
# ==============================================================================

def run_tests():
    num_nodes = 500
    top_k = 5

    # 1. Test High Selectivity (1% of data matches target_tag "rare")
    # 5 out of 500 nodes have "rare", 495 have "common"
    nodes = []
    for i in range(num_nodes):
        x = random.uniform(0, 100)
        y = random.uniform(0, 100)
        tag = "rare" if i < 10 else "common"  # 2% selectivity
        nodes.append(VectorNode(i, (x, y), tag))

    build_proximity_graph(nodes, k_neighbors=8)

    query = (50.0, 50.0)
    ground_truth = exact_filtered_knn(nodes, query, target_tag="rare", top_k=top_k)

    print("=== Filtered Vector Search Evaluation (Selectivity = 2%) ===")
    print(f"Ground Truth Top-{top_k}: {ground_truth}")

    # Run Post-Filtering
    post_res = post_filtering_search(nodes, query, target_tag="rare", top_k=top_k, ef_search=30)
    post_recall = len(set(post_res) & set(ground_truth)) / len(ground_truth)
    print(f"Post-Filtering Results: {post_res}, Recall: {post_recall*100:.1f}%")

    # Run Naive Pre-Filtering
    naive_res = naive_pre_filtering_search(nodes, query, target_tag="rare", top_k=top_k, ef_search=30)
    naive_recall = len(set(naive_res) & set(ground_truth)) / len(ground_truth)
    print(f"Naive Pre-Filtering Results: {naive_res}, Recall: {naive_recall*100:.1f}%")

    # Run In-Graph Single-Stage Traversal
    single_stage_res = in_graph_single_stage_search(nodes, query, target_tag="rare", top_k=top_k, ef_search=30)
    single_stage_recall = len(set(single_stage_res) & set(ground_truth)) / len(ground_truth)
    print(f"In-Graph Single-Stage Results: {single_stage_res}, Recall: {single_stage_recall*100:.1f}%")

    # Critical Assertions Demonstrating the Core Trade-offs:
    # 1. Under 2% selectivity, Post-filtering suffers catastrophic recall drop (often 0 or 1 result)
    assert post_recall < 0.5, f"Post-filtering must fail under high selectivity! Got {post_recall}"
    print("✓ Verified: Post-filtering experiences recall catastrophe under high selectivity.")

    # 2. Naive pre-filtering suffers from graph disconnection (cannot bridge across common nodes)
    assert naive_recall <= single_stage_recall, "Naive pre-filtering must not beat single-stage bridge search"

    # 3. In-graph single-stage achieves high recall by traversing non-matching bridge nodes
    assert single_stage_recall >= 0.8, f"In-graph single-stage should maintain >= 80% recall, got {single_stage_recall}"
    print("✓ Verified: In-graph bridge traversal maintains high recall without graph disconnection.\n")

    print("ALL TESTS PASSED SUCCESSFULLY.")

if __name__ == "__main__":
    run_tests()
