#!/usr/bin/env bash
# 制造死元组：REPEATABLE READ 长事务先建快照，UPDATE 提交后旧版本仍被该快照
# 看见、不会被插入路径上的 prune 回收；快照事务提交后，这些旧版本才变成死元组，
# 但已离开任何写路径，只能等 VACUUM 来收——这就是"最老快照拖住回收"的实物。
#
# 为什么不是 autocommit 单条 UPDATE？
# PG16 实测：autocommit 单条 UPDATE 提交后，旧版本对任何新快照都不可见，
# HOT/索引插入会顺势 prune 它们，pgstattuple 里 dead_tuple_count 归零，
# 只剩 free_percent 上涨——"死元组积累"被写路径顺手消化了。
# 本脚本用两会话隔离出"旧版本可见但不可回收"的窗口，让它真实积累。
#
# 环境：PostgreSQL 16，依赖 01 脚本已跑。
# 运行：bash experiments/postgres-bloat/02_generate_dead_tuples.sh
# 依赖：conntrack 不涉及；需要本机 docker 与 pg-bloat 容器（见 README）。

set -euo pipefail
P="docker exec -i blog-pg psql -U postgres"

# 会话 A：REPEATABLE READ 建快照并保持（sleep 让 UPDATE 在窗口内提交）
$P -q -c "BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT 'snapshot-established' AS holder;" &

# 等快照事务落定
sleep 1.5

# 会话 B：全表 UPDATE（提交时旧版本对 A 的快照仍可见，不被 prune）
$P -v ON_ERROR_STOP=1 -c "UPDATE bloat_demo.orders SET amount = amount * 1.0001;"
echo "-- UPDATE committed while snapshot A open"

wait

# 会话 A 提交：旧版本此刻才对本机一切新快照不可见，变死元组
echo "-- snapshot A committed; dead tuples now visible to pgstattuple"

# 立即精确量（趁 autovacuum 还没醒：01 脚本已关表级 autovacuum）
$P -c "SELECT table_len, tuple_count, dead_tuple_count,
              round(dead_tuple_percent::numeric, 1) AS dead_tuple_percent,
              round(free_percent::numeric, 1) AS free_percent
       FROM pgstattuple('bloat_demo.orders');"