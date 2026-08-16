# Consistent hashing boundary experiment

`consistent_hash.py` compares the same 100,000 deterministic keys under a three-to-four-node change:

- modulo assignment changes the divisor from 3 to 4;
- a ring assigns each key to the first node clockwise from its hash.

The script uses only the Python standard library. The output is a deterministic illustration of remapping for this hash function and node names; it is not a universal distribution guarantee. Real systems also need virtual nodes or another balancing strategy, collision handling, node removal rules and cache-miss behavior.

Run from the repository root:

```bash
python3 experiments/consistent-hashing-boundary/consistent_hash.py
```
