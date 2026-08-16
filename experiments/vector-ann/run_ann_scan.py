#!/usr/bin/env python3
"""Vector ANN scan: HNSW (hnswlib) vs IVF-PQ (faiss) vs brute force (faiss flat).

Runs on a small synthetic L2 dataset, sweeps the knobs that decide the
recall / QPS / memory tradeoff triangle:

  - HNSW: M and efSearch (hnswlib). Recall is bought with graph density.
  - IVF-PQ: nprobe (faiss). Recall is bought back by scanning more buckets.
  - flat: exact baseline, one point at recall=1.0.

Index size is measured as serialized index bytes (hnswlib save_index,
faiss serialize_index) - a deterministic proxy for steady-state memory.
Search latency is the min of 3 batch runs to cut timer noise.

Outputs go to results/: three PNG curves plus one CSV.

Run (from the repo root):
    python3 experiments/vector-ann/run_ann_scan.py [--n 100000 --d 128 --queries 1000 --k 10]

Deps: numpy, faiss-cpu, hnswlib (matplotlib optional - without it, no PNGs,
only the CSV and the printed table).
"""

import argparse
import csv
import os
import sys
import tempfile
import time

import numpy as np


def build_data(n, d, nq, seed):
    rng = np.random.default_rng(seed)
    xb = rng.standard_normal((n, d), dtype=np.float32)
    xq = rng.standard_normal((nq, d), dtype=np.float32)
    return xb, xq


def recall_at_k(pred, truth, k):
    """recall@k = fraction of the true k-NN that the returned top-k contains, per query, averaged."""
    nq = pred.shape[0]
    hits = sum(len(set(pred[i].tolist()) & set(truth[i].tolist())) for i in range(nq))
    return hits / (nq * k)


def index_bytes_faiss(index):
    import faiss
    return len(faiss.serialize_index(index))


def index_bytes_hnsw(index):
    fd, path = tempfile.mkstemp(suffix=".hnsw")
    os.close(fd)
    try:
        index.save_index(path)
        return os.path.getsize(path)
    finally:
        os.remove(path)


def best_search_time(fn, repeats):
    best = float("inf")
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn()
        best = min(best, time.perf_counter() - t0)
    return best


def run_flat(xb, xq, k, repeats=3):
    import faiss
    index = faiss.IndexFlatL2(xb.shape[1])
    index.add(xb)
    t = best_search_time(lambda: index.search(xq, k), repeats)
    _, truth = index.search(xq, k)
    return {
        "algo": "flat", "m": 0, "ef_construction": 0, "ef_search": 0,
        "nlist": 0, "nprobe": 0, "recall": 1.0, "qps": len(xq) / t,
        "index_bytes": index_bytes_faiss(index), "build_s": 0.0,
    }, truth


def run_hnsw(xb, xq, k, truth, M, ef_construction, ef_search, repeats=3):
    import hnswlib
    index = hnswlib.Index(space="l2", dim=xb.shape[1])
    index.init_index(
        max_elements=xb.shape[0], ef_construction=ef_construction,
        M=M, random_seed=0,
    )
    t0 = time.perf_counter()
    index.add_items(xb, np.arange(xb.shape[0]))
    build_s = time.perf_counter() - t0
    index.set_ef(ef_search)
    t = best_search_time(lambda: index.knn_query(xq, k=k), repeats)
    labels, _ = index.knn_query(xq, k=k)
    return {
        "algo": "hnsw", "m": M, "ef_construction": ef_construction,
        "ef_search": ef_search, "nlist": 0, "nprobe": 0,
        "recall": recall_at_k(labels, truth, k), "qps": len(xq) / t,
        "index_bytes": index_bytes_hnsw(index), "build_s": build_s,
    }


def run_ivfpq(xb, xq, k, truth, nlist, m, nprobe, train_size=50000, repeats=3):
    import faiss
    d = xb.shape[1]
    # Coarse quantizer: nlist k-means centroids pick the buckets; PQ (nbits=8
    # -> k=256 per sub-codebook) stores each vector as m bytes.
    index = faiss.IndexIVFPQ(faiss.IndexFlatL2(d), d, nlist, m, 8)
    rng = np.random.default_rng(1)
    n_train = min(train_size, xb.shape[0])
    train = xb[rng.choice(xb.shape[0], n_train, replace=False)]
    t0 = time.perf_counter()
    index.train(train)
    index.add(xb)
    build_s = time.perf_counter() - t0
    index.nprobe = min(nprobe, nlist)
    t = best_search_time(lambda: index.search(xq, k), repeats)
    _, pred = index.search(xq, k)
    return {
        "algo": "ivfpq", "m": m, "ef_construction": 0, "ef_search": 0,
        "nlist": nlist, "nprobe": min(nprobe, nlist),
        "recall": recall_at_k(pred, truth, k), "qps": len(xq) / t,
        "index_bytes": index_bytes_faiss(index), "build_s": build_s,
    }


def write_csv(path, rows):
    fields = ["algo", "m", "ef_construction", "ef_search", "nlist", "nprobe",
              "recall", "qps", "index_bytes", "build_s"]
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def write_plots(out_dir, rows):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        print("matplotlib not available; skipping PNGs", file=sys.stderr)
        return

    flat = [r for r in rows if r["algo"] == "flat"]
    hnsw = [r for r in rows if r["algo"] == "hnsw"]
    ivf = [r for r in rows if r["algo"] == "ivfpq"]

    def scatter(ax, r, color, label, marker="o", annotate=False):
        ax.scatter(r["qps"], r["recall"], c=color, label=label, marker=marker, s=36)
        if annotate:
            ax.annotate(f"nprobe={r['nprobe']}", (r["qps"], r["recall"]),
                        textcoords="offset points", xytext=(4, -12), fontsize=7)

    # Curve 1: recall vs QPS.
    fig, ax = plt.subplots()
    ax.set_xscale("log")
    for r in hnsw:
        ax.scatter(r["qps"], r["recall"], c="tab:blue", s=30)
    for r in ivf:
        scatter(ax, r, "tab:orange", None, annotate=True)
    if flat:
        ax.scatter(flat[0]["qps"], flat[0]["recall"], c="tab:green",
                   label="flat (exact)", marker="*", s=120)
    ax.set_xlabel("QPS (log)")
    ax.set_ylabel("recall@10")
    ax.set_title("recall vs QPS")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "recall_vs_qps.png"), dpi=150)
    plt.close(fig)

    # Curve 2: recall vs index size.
    fig, ax = plt.subplots()
    ax.set_xscale("log")
    for r in hnsw:
        ax.scatter(r["index_bytes"], r["recall"], c="tab:blue", s=30)
    for r in ivf:
        ax.scatter(r["index_bytes"], r["recall"], c="tab:orange", s=30)
    if flat:
        ax.scatter(flat[0]["index_bytes"], flat[0]["recall"], c="tab:green",
                   label="flat (exact)", marker="*", s=120)
    ax.set_xlabel("index bytes (log)")
    ax.set_ylabel("recall@10")
    ax.set_title("recall vs index size")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "recall_vs_index_bytes.png"), dpi=150)
    plt.close(fig)

    # Curve 3: QPS vs index size (same data, speed/memory axis).
    fig, ax = plt.subplots()
    ax.set_xscale("log")
    ax.set_yscale("log")
    for r in hnsw:
        ax.scatter(r["index_bytes"], r["qps"], c="tab:blue", s=30)
    for r in ivf:
        ax.scatter(r["index_bytes"], r["qps"], c="tab:orange", s=30)
    if flat:
        ax.scatter(flat[0]["index_bytes"], flat[0]["qps"], c="tab:green",
                   label="flat (exact)", marker="*", s=120)
    ax.set_xlabel("index bytes (log)")
    ax.set_ylabel("QPS (log)")
    ax.set_title("QPS vs index size")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "qps_vs_index_bytes.png"), dpi=150)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description="HNSW / IVF-PQ / flat ANN scan")
    ap.add_argument("--n", type=int, default=100_000, help="database size")
    ap.add_argument("--d", type=int, default=128, help="vector dimension (must be divisible by m=8)")
    ap.add_argument("--queries", type=int, default=1_000)
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--seed", type=int, default=123)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "results"))
    args = ap.parse_args()

    if args.d % 8 != 0:
        sys.exit("--d must be divisible by 8 (m=8 for IVF-PQ)")

    import faiss  # required: ground truth and the IVF-PQ index live here
    print(f"faiss {faiss.__version__}")

    os.makedirs(args.out, exist_ok=True)
    xb, xq = build_data(args.n, args.d, args.queries, args.seed)

    rows = []
    flat, truth = run_flat(xb, xq, args.k)
    rows.append(flat)
    print(f"flat: recall=1.0 qps={flat['qps']:.0f} index_bytes={flat['index_bytes']}")

    hnsw_rows = []
    for M in (8, 16, 32):
        for ef in (32, 64, 128, 256):
            r = run_hnsw(xb, xq, args.k, truth, M=M, ef_construction=200, ef_search=ef)
            hnsw_rows.append(r)
            print(f"hnsw M={M} efC=200 efS={ef}: recall={r['recall']:.3f} "
                  f"qps={r['qps']:.0f} bytes={r['index_bytes']} build={r['build_s']:.1f}s")

    ivf_rows = []
    nlist = 1000
    for nprobe in (1, 2, 4, 8, 16, 32, 64, 128, 256):
        r = run_ivfpq(xb, xq, args.k, truth, nlist=nlist, m=8, nprobe=nprobe)
        ivf_rows.append(r)
        print(f"ivfpq nlist={nlist} m=8 nprobe={r['nprobe']}: recall={r['recall']:.3f} "
              f"qps={r['qps']:.0f} bytes={r['index_bytes']} build={r['build_s']:.1f}s")

    rows += hnsw_rows + ivf_rows
    write_csv(os.path.join(args.out, "ann_scan.csv"), rows)
    write_plots(args.out, rows)
    print(f"results written to {args.out}/ (ann_scan.csv, *_png)")


if __name__ == "__main__":
    main()
