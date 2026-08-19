#!/usr/bin/env python3
# 教科书模型: 消除"扫描污染"差异
# A) 写 4000 基础键; B) 热键=前 1000, 每键 GET 20 次(高频访问, 频次 20);
# C) 写 9000 新键并批量 GET 一遍(顺序扫描, 频次 1 但量大"最近"); D) 查热键存活
# 容量: 每键约 1KB(512B 值 + overhead), maxmemory=8mb → 容量约 7800, C 触顶淘汰
import subprocess, time

POLICIES = ["allkeys-lru", "allkeys-lfu", "allkeys-random", "noeviction"]
A, HOT, B_REPEAT, C, SCAN = 4000, 1000, 20, 9000, 9000
VALUE = "x" * 512

def port_of(p): return {"allkeys-lru":16401,"allkeys-lfu":16402,"allkeys-random":16403,"noeviction":16404}[p]

def pipe(port, cmds, collect_errors=False):
    p = subprocess.run(["docker","exec","-i",f"redis-evict-{port}","redis-cli","-p",str(port),"--pipe"],
                       input=("".join(cmds)).encode(), capture_output=True)
    out = p.stdout.decode()
    if collect_errors:
        e = 0
        if "errors:" in out: e = int(out.split("errors:")[1].split(",")[0])
        return e
    return out

def cli(port,*a):
    return subprocess.run(["docker","exec",f"redis-evict-{port}","redis-cli","-p",str(port),*a],
                          capture_output=True).stdout.decode().strip()

def main():
    print(f"{'policy':>16} | {'C_writes_failed':>15} | {'evicted':>8} | {'hot/1000':>8} | {'dbsize':>6}")
    for policy in POLICIES:
        port = port_of(policy)
        subprocess.run(["docker","rm","-f",f"redis-evict-{port}"], capture_output=True)
        subprocess.run(["docker","run","-d","--name",f"redis-evict-{port}","redis:7-alpine",
                        "redis-server","--port",str(port),"--maxmemory","8mb",
                        "--maxmemory-policy",policy,"--appendonly","no"], capture_output=True)
        time.sleep(1)
        # A) 基础键 4000
        pipe(port, (f"SET k{i} {VALUE}\r\n" for i in range(1, A+1)))
        # B) 热键高频 GET 20 次
        for _ in range(B_REPEAT):
            pipe(port, (f"GET k{i}\r\n" for i in range(1, HOT+1)))
        # C) 新键 9000 + 全量 GET(扫描)
        errs = pipe(port, (f"SET x{i} {VALUE}\r\n" for i in range(A+1, A+C+1)), collect_errors=True)
        pipe(port, (f"GET x{i}\r\n" for i in range(A+1, A+C+1)))
        # D) 热键存活: 单次 exec 批量 EXISTS(非 --pipe 模式, 每行返回整数)
        probe = "".join(f"EXISTS k{i}\n" for i in range(1, HOT+1))
        p = subprocess.run(["docker","exec","-i",f"redis-evict-{port}","redis-cli","-p",str(port)],
                           input=probe.encode(), capture_output=True)
        survived = sum(1 for line in p.stdout.decode().splitlines() if line.strip() == "1")
        evicted = cli(port,"INFO","stats").split("evicted_keys:")[1].split("\r\n")[0]
        dbsize = cli(port,"DBSIZE")
        print(f"{policy:>16} | {errs:>15} | {evicted:>8} | {survived:>8} | {dbsize:>6}")
        subprocess.run(["docker","rm","-f",f"redis-evict-{port}"], capture_output=True)

if __name__ == "__main__":
    main()
