#!/usr/bin/env python3
# 对比 maxmemory-policy: allkeys-lru / allkeys-lfu / allkeys-random / noeviction
import subprocess, sys, time

POLICIES = ["allkeys-lru", "allkeys-lfu", "allkeys-random", "noeviction"]
TOTAL, VALUE = 250_000, "x" * 512
HOT_MAX, CHECK = 200_000, 2000

def pipe(port, cmds):
    payload = "".join(cmds).encode()
    p = subprocess.run(["docker", "exec", "-i", f"redis-evict-{port}", "redis-cli", "-p", str(port), "--pipe"],
                       input=payload, capture_output=True)
    return p.stdout.decode()

def cli(port, *args):
    out = subprocess.run(["docker", "exec", f"redis-evict-{port}", "redis-cli", "-p", str(port), *args],
                         capture_output=True).stdout.decode().strip()
    return out

def main():
    summary = []
    for policy in POLICIES:
        port = 16381 if policy == "allkeys-lru" else (16382 if policy == "allkeys-lfu" else (16383 if policy == "allkeys-random" else 16384))
        subprocess.run(["docker", "rm", "-f", f"redis-evict-{port}"], capture_output=True)
        subprocess.run(["docker", "run", "-d", "--name", f"redis-evict-{port}", "redis:7-alpine",
                        "redis-server", "--port", str(port), "--maxmemory", "64mb",
                        "--maxmemory-policy", policy, "--appendonly", "no"], capture_output=True)
        time.sleep(1)
        t0 = time.time()
        # 1) 全量写入(TOTAL 键, 512B each ≈ 128MB > 64mb → 必然触发淘汰)
        for start in range(1, TOTAL + 1, 2000):
            end = min(start + 1999, TOTAL)
            pipe(port, [f"SET k{i} {VALUE}\r\n" for i in range(start, end + 1)])
        # 2) 访问热键池(前 HOT_MAX 键中奇数键 GET 一次)
        hot_cmds = (f"GET k{i}\r\n" for i in range(1, HOT_MAX + 1, 2))
        pipe(port, hot_cmds)
        # 3) 热键存活检查
        survived = sum(1 for i in range(1, CHECK + 1, 2) if cli(port, "EXISTS", f"k{i}") == "1")
        evicted = cli(port, "INFO", "stats").split("evicted_keys:")[1].split("\r\n")[0]
        hits = cli(port, "INFO", "stats").split("keyspace_hits:")[1].split("\r\n")[0]
        dbsize = cli(port, "DBSIZE")
        elapsed = round(time.time() - t0, 1)
        print(f"{policy}: evicted={evicted} hits={hits} dbsize={dbsize} hot_survived={survived}/{CHECK} ({elapsed}s)")
        summary.append(f"{policy}: evicted={evicted} hits={hits} hot={survived}/{CHECK}")
        subprocess.run(["docker", "rm", "-f", f"redis-evict-{port}"], capture_output=True)
    print("\n===== SUMMARY =====")
    for s in summary:
        print(s)

if __name__ == "__main__":
    main()
