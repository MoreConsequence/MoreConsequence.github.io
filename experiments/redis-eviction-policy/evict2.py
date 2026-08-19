#!/usr/bin/env python3
# 两阶段: A) 写 6 万键(低于 64mb 容量) B) GET 热键池 1.5 万次 C) 再写 8 万新键(强制淘汰) D) 查热键存活
import subprocess, time

POLICIES = ["allkeys-lru", "allkeys-lfu", "allkeys-random", "noeviction"]
STAGE_A, STAGE_C, HOT_SET = 60_000, 80_000, 15_000
VALUE = "x" * 512

def port_of(p): return {"allkeys-lru":16381,"allkeys-lfu":16382,"allkeys-random":16383,"noeviction":16384}[p]

def pipe(port, cmds, collect_errors=False):
    p = subprocess.run(["docker","exec","-i",f"redis-evict-{port}","redis-cli","-p",str(port),"--pipe"],
                       input=("".join(cmds)).encode(), capture_output=True)
    out = p.stdout.decode()
    if collect_errors:
        errs = 0
        if "errors:" in out:
            errs = int(out.split("errors:")[1].split(",")[0])
        return errs
    return out

def cli(port, *args):
    return subprocess.run(["docker","exec",f"redis-evict-{port}","redis-cli","-p",str(port),*args],
                          capture_output=True).stdout.decode().strip()

def main():
    print(f"{'policy':>16} | {'stageC_errors':>12} | {'evicted':>8} | {'hot_survived':>12} | {'dbsize':>6}")
    for policy in POLICIES:
        port = port_of(policy)
        subprocess.run(["docker","rm","-f",f"redis-evict-{port}"], capture_output=True)
        subprocess.run(["docker","run","-d","--name",f"redis-evict-{port}","redis:7-alpine",
                        "redis-server","--port",str(port),"--maxmemory","64mb",
                        "--maxmemory-policy",policy,"--appendonly","no"], capture_output=True)
        time.sleep(1)
        # A) 写 6 万键(总计 ~36MB < 64mb, 无淘汰)
        pipe(port, (f"SET k{i} {VALUE}\r\n" for i in range(1, STAGE_A+1)))
        # B) 访问热键池: 前 15000 键各 GET 两次
        pipe(port, (f"GET k{i}\r\n" for i in range(1, HOT_SET+1)))
        pipe(port, (f"GET k{i}\r\n" for i in range(1, HOT_SET+1, 2)))
        # C) 再写 8 万新键(总量 ~85MB > 64mb → 必须淘汰约 2.5 万)
        errors = pipe(port, (f"SET x{i} {VALUE}\r\n" for i in range(STAGE_A+1, STAGE_A+STAGE_C+1)), collect_errors=True)
        # D) 检查热键存活(单次 pipe 批量 EXISTS, 避免每次 docker exec 的启动开销)
        exist_out = pipe(port, (f"EXISTS k{i}\r\n" for i in range(1, HOT_SET+1)))
        survived = exist_out.count(":1\r\n")
        evicted = cli(port,"INFO","stats").split("evicted_keys:")[1].split("\r\n")[0]
        dbsize = cli(port,"DBSIZE")
        print(f"{policy:>16} | {errors:>12} | {evicted:>8} | {survived:>6}/{HOT_SET} | {dbsize:>6}")
        subprocess.run(["docker","rm","-f",f"redis-evict-{port}"], capture_output=True)

if __name__ == "__main__":
    main()
