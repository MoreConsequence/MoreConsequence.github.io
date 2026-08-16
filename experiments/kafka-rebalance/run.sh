#!/usr/bin/env bash
# 复现一次 eager 再平衡的 stop-the-world 空窗：
#   起 broker → 建 8 分区 topic → 起 2000 msg/s 生产者 → 起 3 个消费者 →
#   第 20s SIGSTOP consumer-2（心跳停发=模拟挂死）→ 每秒采样组状态与消费速率 → 汇总。
# 用法: ./run.sh   （可选环境变量: PARTITIONS MEMBERS RATE DURATION SESSION_MS KILL_AFTER SAMPLE_MS WATCH）
# 输出: kafka-rebalance.csv（t_s, 组状态, 每秒消费条数, 累计消费）
set -euo pipefail
cd "$(dirname "$0")"

PARTITIONS="${PARTITIONS:-8}"
MEMBERS="${MEMBERS:-3}"
RATE="${RATE:-2000}"            # 生产者每秒条数
DURATION="${DURATION:-200}"     # 生产时长(秒)，须 > WATCH
SESSION_MS="${SESSION_MS:-6000}" # 消费端 session.timeout.ms，调小让挂死检测快点、实验窗口短
KILL_AFTER="${KILL_AFTER:-20}"  # 第几秒 SIGSTOP 一个成员
SAMPLE_MS="${SAMPLE_MS:-1.0}"   # 采样间隔(秒)
WATCH="${WATCH:-60}"            # 采样总时长(秒)

GROUP="demo-group"
TOPIC="rebalance-demo"
BROKER="kafka:9092"             # 经 compose 网络访问，见 docker-compose.yml 的 advertised 说明

cleanup() { docker compose down -t 0 --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> 起 broker (KRaft 单节点, classic 再平衡协议)"
docker compose up -d

echo "==> 等 broker 就绪"
ready=0
for _ in $(seq 1 60); do
  if docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BROKER" --list >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "broker 未就绪"; exit 1; }

echo "==> 重建 topic $TOPIC (partitions=$PARTITIONS)，清掉上次运行残留的 offset"
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BROKER" \
  --delete --topic "$TOPIC" >/dev/null 2>&1 || true
sleep 1
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BROKER" \
  --create --topic "$TOPIC" --partitions "$PARTITIONS" --replication-factor 1

echo "==> 起生产者 (${RATE} msg/s, 持续 ${DURATION}s)"
docker compose run -d --name producer kafka /opt/kafka/bin/kafka-producer-perf-test.sh \
  --topic "$TOPIC" --num-records $((RATE * DURATION)) --throughput "$RATE" --record-size 100 \
  --producer-props bootstrap.servers="$BROKER"

echo "==> 起 $MEMBERS 个消费者 (session.timeout.ms=$SESSION_MS, 心跳=$(($SESSION_MS / 3))ms)"
for i in $(seq 1 "$MEMBERS"); do
  docker compose run -d --name "consumer-$i" kafka /opt/kafka/bin/kafka-console-consumer.sh \
    --bootstrap-server "$BROKER" --topic "$TOPIC" --group "$GROUP" --from-beginning \
    --consumer-property "session.timeout.ms=$SESSION_MS" \
    --consumer-property "heartbeat.interval.ms=$((SESSION_MS / 3))" \
    --consumer-property "max.poll.interval.ms=15000"
done

echo "==> 采样消费速率/组状态, ${KILL_AFTER}s 时 SIGSTOP consumer-2 模拟挂死"
python3 measure.py "$SAMPLE_MS" "$KILL_AFTER" "$WATCH" "$MEMBERS"

echo "==> 完成。看 kafka-rebalance.csv：速率归零的区间宽度≈停摆窗口；停摆窗口 × 生产速率≈lag 尖峰"
