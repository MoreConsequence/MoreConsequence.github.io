#!/usr/bin/env bash
# 对比 maxmemory-policy: allkeys-lru / allkeys-lfu / allkeys-random / noeviction
# 1) 写入 250000 个键(每个 512B), maxmemory=64mb 触顶 → 淘汰发生
# 2) 对热键池(前 20 万个键中的奇数键)做一轮 GET 访问
# 3) 检查前 2000 个热键存活率 + INFO 的 evicted_keys/hits
set -e
VALUE_BYTES=512
TOTAL=250000
HOT_CHECK=2000

run_policy() {
  local POLICY=$1
  docker rm -f redis-evict-demo >/dev/null 2>&1 || true
  docker run -d --name redis-evict-demo redis:7-alpine \
    redis-server --port 16379 --maxmemory 64mb --maxmemory-policy $POLICY --appendonly no >/dev/null
  local REDIS="docker exec redis-evict-demo redis-cli -p 16379"

  echo "=== policy=$POLICY ==="
  # 1) 批量写入全部键
  for (( i=1; i<=TOTAL; i+=2000 )); do
    local end=$((i+1999)); [ $end -gt $TOTAL ] && end=$TOTAL
    {
      for (( j=i; j<=end; j++ )); do
        printf 'SET k%d %*s\r\n' $j $VALUE_BYTES ''
      done
    } | $REDIS --pipe > /dev/null
  done

  # 2) 访问热键池: 前 20 万个键中每第 2 个 GET 一次
  {
    for (( i=1; i<=200000; i+=2 )); do printf 'GET k%d\r\n' $i; done
  } | $REDIS --pipe > /dev/null

  # 3) 热键存活率
  local survived=0
  for (( i=1; i<=HOT_CHECK; i+=2 )); do
    [ "$($REDIS EXISTS k$i)" = "1" ] && survived=$((survived+1))
  done

  local evicted=$($REDIS INFO stats | awk -F: '/evicted_keys/{gsub(/[^0-9]/, "", $2); print $2}')
  local hits=$($REDIS INFO stats | awk -F: '/keyspace_hits/{gsub(/[^0-9]/, "", $2); print $2}')
  local dbsize=$($REDIS DBSIZE)
  echo "evicted_keys=$evicted keyspace_hits=$hits dbsize=$dbsize hot_survived=$survived/$HOT_CHECK"
  echo "$POLICY|evicted=$evicted|hits=$hits|hot=$survived/$HOT_CHECK" >> /tmp/evict-summary.txt
  docker rm -f redis-evict-demo >/dev/null 2>&1 || true
}

rm -f /tmp/evict-summary.txt
for p in allkeys-lru allkeys-lfu allkeys-random noeviction; do
  run_policy $p
done
echo; echo "===== 汇总 ====="
cat /tmp/evict-summary.txt
