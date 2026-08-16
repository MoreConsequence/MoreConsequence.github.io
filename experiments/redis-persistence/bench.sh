#!/usr/bin/env bash
# 对比三种 appendfsync 档位（no / everysec / always）下 SET 吞吐。
#
# 做法：每次起一个全新的 redis:7 容器（干净数据），用 --save '' 关掉 RDB，
# 只改 appendfsync 一个变量；用容器内 redis-benchmark 压同一份 SET 负载。
# 注意：结果是"本机 + 容器文件系统/磁盘"下的对比，绝对值随磁盘变化，
# 相对排序（always 明显慢于另两档）比绝对数字更有参考价值；单次跑只算一次结果。
#
# 运行：bash experiments/redis-persistence/bench.sh
set -euo pipefail

for fsync in no everysec always; do
  name="redis-persist-bench-$fsync"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" \
    redis:7 redis-server \
      --appendonly yes \
      --appendfsync "$fsync" \
      --save '' \
    >/dev/null
  # 等容器就绪
  for _ in $(seq 1 50); do
    docker exec "$name" redis-cli PING 2>/dev/null | grep -q PONG && break
    sleep 0.2
  done

  echo "== appendfsync=$fsync =="
  docker exec "$name" redis-benchmark -t set -n 100000 -c 50 -d 32
  docker rm -f "$name" >/dev/null
done
