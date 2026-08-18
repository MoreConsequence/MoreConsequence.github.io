#!/usr/bin/env python3
"""采样消费组状态与消费速率，SIGSTOP 一个成员触发 rebalance，量化 stop-the-world 空窗。

用法: python3 measure.py [sample_ms] [kill_after_s] [watch_s] [n_members]
依赖: 已由 run.sh 起好 broker + producer + consumer-1..N（消费者 stdout 即每条消费记录）。
输出: kafka-rebalance.csv，每行 (t_s, 组状态, 每秒消费条数, 累计消费)。
读法: 速率归零的区间宽度≈停摆窗口；停摆窗口 × 生产者速率≈lag 尖峰。

注意: --describe --state 在 PreparingRebalance/CompletingRebalance 期间返回对应状态，
因此组状态列能标出空窗的确切起点（离开 Stable）与终点（回到 Stable）。
"""
import csv
import subprocess
import sys
import time

SAMPLE_MS = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
KILL_AFTER = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
WATCH_S = float(sys.argv[3]) if len(sys.argv) > 3 else 60.0
N_MEMBERS = int(sys.argv[4]) if len(sys.argv) > 4 else 3

BROKER = "kafka:9092"
GROUP = "demo-group"


def sh(*args):
    return subprocess.run(["docker", *args], capture_output=True, text=True).stdout


def group_state():
    """返回组状态机的当前态，读不到返回 'no-group'。

    输出列是 GROUP | COORDINATOR (ID) | STATE，第 2 列是 coordinator 地址，
    状态是最后一列（Stable/PreparingRebalance/CompletingRebalance/Empty/Dead）。
    不能固定按列取：COORDINATOR 形如 "kafka:9092 (0)" 占两个 token。
    """
    out = sh(
        "compose", "exec", "-T", "kafka",
        "/opt/kafka/bin/kafka-consumer-groups.sh",
        "--bootstrap-server", BROKER, "--describe", "--state", "--group", GROUP,
    )
    for line in out.splitlines():
        parts = line.split()
        if parts and parts[0] == GROUP:
            for p in reversed(parts):
                if p in ("Stable", "PreparingRebalance", "CompletingRebalance",
                         "Empty", "Dead", "NoOffset"):
                    return p
    return "no-group"


def consumed(i):
    """consumer-i 累计消费条数 = 容器日志行数（每条记录一行）。"""
    return sh("logs", f"consumer-{i}").count("\n")


def main():
    prev = {i: consumed(i) for i in range(1, N_MEMBERS + 1)}
    killed = False
    t = 0.0
    with open("kafka-rebalance.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["t_s", "group_state", "rate_msg_per_s", "total_consumed"])
        while t <= WATCH_S:
            if not killed and t >= KILL_AFTER:
                # docker pause 冻结整个 cgroup（所有线程停摆、心跳停发），比 SIGSTOP
                # 更贴近"成员物理挂死"：SIGSTOP 只发进程信号，OrbStack 上对 Java 容器
                # 实测无效（consumer-2 仍在消费、组状态全程 Stable）。
                print(f"[t={t:.1f}s] docker pause consumer-2 模拟成员挂死（心跳停发）")
                sh("pause", "consumer-2")
                killed = True
            cur = {i: consumed(i) for i in range(1, N_MEMBERS + 1)}
            rate = sum(cur[i] - prev[i] for i in cur) / SAMPLE_MS
            state = group_state()
            w.writerow([round(t, 2), state, round(rate, 1), sum(cur.values())])
            f.flush()
            print(f"t={t:5.1f}s state={state:<22} rate={rate:8.1f} msg/s")
            prev = cur
            time.sleep(SAMPLE_MS)
            t += SAMPLE_MS
    print("已写入 kafka-rebalance.csv（t_s, 组状态, 每秒消费条数, 累计消费）")


if __name__ == "__main__":
    main()
