#!/usr/bin/env bash
# mysql-ddl 全流程自动复现，保存 raw 输出到 evidence。
# 会话时序: A 长事务 → B ALTER(撞锁等待) → C 观察 → B 超时报错 → 负对照(重置后 ALTER 秒回)
set -u
MYSQL="docker exec -i blog-mysql mysql -uroot -proot"
OUT=${1:-evidence/mysql-optimizer-placeholder}
DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$OUT"

echo "== 0) 建库建表 20 万行 =="
docker exec -i blog-mysql mysql -uroot -proot < "$DIR/01_setup.sql" > "$OUT/01_setup.out" 2>&1 && echo ok

echo "== 1) 会话 A: 长事务占共享锁 (SLEEP 120s) =="
docker exec -i blog-mysql mysql -uroot -proot ddl_demo < "$DIR/02_long_txn.sql" > "$OUT/02_long_txn.out" 2>&1 &
A_PID=$!
sleep 3

echo "== 2) 会话 B: ALTER (lock_wait_timeout=20) =="
docker exec -i blog-mysql mysql -uroot -proot ddl_demo < "$DIR/03_ddl_wait.sql" > "$OUT/03_ddl_wait.out" 2>&1 &
B_PID=$!
sleep 5

echo "== 3) 会话 C: 观察 processlist + MDL 队列 =="
docker exec -i blog-mysql mysql -uroot -proot ddl_demo < "$DIR/04_watch.sql" > "$OUT/04_watch.out" 2>&1 && echo ok

echo "== 4) 等 B 超时(约 15s 余量) =="
wait $B_PID
echo "== 5) 等 A 结束(后台 120s, 不用等, 直接杀会话再跑负对照) =="
docker exec blog-mysql mysql -uroot -proot -e "KILL $(docker exec blog-mysql mysql -uroot -proot -N -e "SELECT ID FROM information_schema.PROCESSLIST WHERE COMMAND='Query' AND TIME>100" 2>/dev/null | head -1)" 2>/dev/null || true
wait $A_PID 2>/dev/null || true

echo "== 6) 负对照: 无长事务下同一条 ALTER =="
docker exec -i blog-mysql mysql -uroot -proot ddl_demo < "$DIR/03_ddl_wait.sql" > "$OUT/03_negative.out" 2>&1 && echo "negative ALTER ok (秒回)"

echo "== 7) 05 算法对比 =="
docker exec -i blog-mysql mysql -uroot -proot ddl_demo < "$DIR/05_algorithm_compare.sql" > "$OUT/05_algorithm.out" 2>&1 && echo ok

echo "== 完成, 输出在 $OUT =="