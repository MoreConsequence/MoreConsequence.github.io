-- 量膨胀：n_dead_tup 估计 + pgstattuple 精确比例 + 冻结年龄。
-- 依赖 02 脚本已跑。若 n_dead_tup 显示 0，说明统计还没刷出来，等 1~2 秒重查
-- （stat collector 约每 500ms 汇总一次）。
-- 运行：docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < experiments/postgres-bloat/03_measure_bloat.sql

\set ON_ERROR_STOP on

-- 1) 粗看：死元组数量与估计膨胀率（统计视图）
SELECT relname,
       n_live_tup,
       n_dead_tup,
       round((100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0))::numeric, 1) AS dead_pct_est,
       last_autovacuum,
       autovacuum_count,
       vacuum_count
FROM pg_stat_user_tables
WHERE schemaname = 'bloat_demo' AND relname = 'orders';

-- 2) 冻结年龄：age(relfrozenxid) 距离 2^31 回卷线（约 21.5 亿）还有多远
SELECT c.relname,
       age(c.relfrozenxid) AS xid_age,
       pg_size_pretty(pg_relation_size(c.oid)) AS table_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'bloat_demo' AND c.relname = 'orders';

-- 3) 精确量膨胀：pgstattuple 逐页读表，给出死元组占表字节的比例（需要先建扩展）
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT table_len,
       tuple_count,
       dead_tuple_count,
       round(dead_tuple_percent::numeric, 1) AS dead_tuple_percent,
       round(free_percent::numeric, 1) AS free_percent
FROM pgstattuple('bloat_demo.orders');

-- 4) 顺序扫描计时（膨胀态）：和 04 脚本 VACUUM 后的耗时对比
\timing on
SELECT count(*) FROM bloat_demo.orders;
\timing off
