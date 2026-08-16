#!/usr/bin/env bash
# 模拟崩溃（kill -9）后，各持久化档位各剩多少数据。
#
# 关键点：本脚本只在"进程被杀"这一层模拟崩溃，宿主内核页缓存仍然活着。
# 所以 AOF everysec/no 的写入即便还没 fsync，也还在页缓存里、之后会被写回，
# 重启后几乎一条不丢——"≤1 秒 / ≤30 秒"是断电窗口（页缓存整体蒸发），
# 同一台活着的机器上用 kill -9 复现不出来。结果怎么读，见 README。
#
# 四档：
#   1) 仅 RDB（appendonly no）：kill -9 丢"上一次 SAVE 之后"写入的全部
#   2) AOF always：逐条 fsync，不丢
#   3) AOF everysec：进程级窗口≈0（断电上限≈1 秒）
#   4) AOF no：进程级窗口≈0（断电上限≈30 秒，取决于 OS 刷盘节奏）
#
# 运行：bash experiments/redis-persistence/crash-loss.sh
set -euo pipefail

N=100

start_redis() { # $1=容器名, 其余为 redis-server 启动参数
  local name=$1; shift
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" redis:7 redis-server "$@" >/dev/null
  for _ in $(seq 1 50); do
    docker exec "$name" redis-cli PING 2>/dev/null | grep -q PONG && return
    sleep 0.2
  done
  echo "容器 $name 启动失败" >&2
  exit 1
}

write_keys() { # $1=容器名；逐条写 N 个 key，写后随机睡 0~150ms 制造 fsync 间隙
  local name=$1
  for i in $(seq 1 "$N"); do
    docker exec "$name" redis-cli SET "k:$i" "v:$i" >/dev/null
    sleep "$(python3 -c "import random; print(f'{random.random()*0.15:.3f}')")"
  done
}

count_keys() { # $1=容器名
  docker exec "$1" redis-cli --scan --pattern 'k:*' | wc -l | tr -d ' '
}

kill_and_restart() { # $1=容器名；kill -9（不经过正常关闭）后重启触发持久化加载
  local name=$1
  docker kill --signal KILL "$name" >/dev/null
  docker start "$name" >/dev/null
  for _ in $(seq 1 50); do
    docker exec "$name" redis-cli PING 2>/dev/null | grep -q PONG && return
    sleep 0.2
  done
  echo "容器 $name 重启失败" >&2
  exit 1
}

echo "写 $N 个 key 后 kill -9、重启、数剩余："

# 1) 仅 RDB：SAVE 落一次快照后立刻写入并杀进程，默认 save 条件（分钟级）来不及触发
name=redis-persist-rdb
start_redis "$name" --appendonly no
docker exec "$name" redis-cli SAVE >/dev/null
write_keys "$name"
kill_and_restart "$name"
echo "仅 RDB（SAVE 后写入即杀）: 剩 $(count_keys "$name") / $N  ← 两次快照之间写入的全部丢失"
docker rm -f "$name" >/dev/null

for fsync in always everysec no; do
  name="redis-persist-$fsync"
  start_redis "$name" --appendonly yes --appendfsync "$fsync" --save ''
  write_keys "$name"
  kill_and_restart "$name"
  echo "AOF $fsync: 剩 $(count_keys "$name") / $N"
  docker rm -f "$name" >/dev/null
done
