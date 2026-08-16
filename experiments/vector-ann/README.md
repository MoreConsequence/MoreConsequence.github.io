# Vector ANN scan: HNSW vs IVF-PQ vs brute force

`run_ann_scan.py` runs on a small synthetic L2 dataset and sweeps the knobs
that decide the recall / QPS / memory triangle of the companion post
`content/posts/vector-index-hnsw-ivf-pq.md`:

- **HNSW** (hnswlib): grid over `M ∈ {8, 16, 32}` × `efSearch ∈ {32, 64, 128, 256}`,
  `efConstruction = 200` fixed;
- **IVF-PQ** (faiss): `nlist = 1000`, `m = 8`, `nbits = 8`, sweep
  `nprobe ∈ {1, 2, 4, 8, 16, 32, 64, 128, 256}`;
- **flat** (faiss `IndexFlatL2`): exact baseline, one point at recall 1.0.

Ground truth for recall@10 is the exact flat top-10 for each query.

- Dataset: `N` random standard-normal vectors, `d = 128`, `N` queries, `k = 10`
  (all overridable via CLI flags).
- **Index size** is measured as *serialized index bytes* (hnswlib `save_index`,
  faiss `serialize_index`) — a deterministic proxy for steady-state memory,
  not RSS.
- **QPS** uses the minimum of 3 batch runs to cut timer noise.

## Install

```bash
python3 -m venv .venv
.venv/bin/pip install numpy faiss-cpu hnswlib matplotlib
```

`matplotlib` is optional: without it the run still prints the table and writes
`ann_scan.csv`, only the three PNG curves are skipped.

## Run

```bash
.venv/bin/python experiments/vector-ann/run_ann_scan.py \
  --n 100000 --d 128 --queries 1000 --k 10
```

Outputs to `experiments/vector-ann/results/`:

- `ann_scan.csv` — one row per (algo, config): recall@10, QPS, index_bytes, build_s;
- `recall_vs_qps.png`, `recall_vs_index_bytes.png`, `qps_vs_index_bytes.png`.

## Backfill

The post's in-text local numbers are placeholders `【本机实测待补】`. After a run,
take the CSV rows for the configurations you cite in the post and replace the
placeholders, recording machine / OS / python + faiss + hnswlib versions and the
exact command in the post's experiment section. This is a synthetic random
dataset — treat it as a mechanism demo, not a benchmark against real embedding
distributions.
