-- 手动 VACUUM（不阻塞读写）回收死元组，然后重测。
-- 重点观察：dead_tuple_percent 归零，但表文件大小（table_len / pg_relation_size）基本不变——
-- 普通 VACUUM 只清页面里死元组、不缩文件，这是最常见的认知坑。
-- 依赖 02/03 脚本已跑。
-- 运行：docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < experiments/postgres-bloat/04_vacuum_and_remeasure.sql

\set ON_ERROR_STOP on

VACUUM bloat_demo.orders;

-- 清理后：冻结年龄前移、表文件大小不变
SELECT c.relname,
       age(c.relfrozenxid) AS xid_age,
       pg_size_pretty(pg_relation_size(c.oid)) AS table_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'bloat_demo' AND c.relname = 'orders';

-- 清理后：死元组比例归零
SELECT dead_tuple_count,
       round(dead_tuple_percent, 1) AS dead_tuple_percent
FROM pgstattuple('bloat_demo.orders');

-- 清理后：统计视图里的死元组归零
SELECT n_live_tup, n_dead_tup, last_vacuum, vacuum_count
FROM pg_stat_user_tables
WHERE schemaname = 'bloat_demo' AND relname = 'orders';

-- 顺序扫描计时（清理态）：和 03 脚本膨胀态耗时对比
\timing on
SELECT count(*) FROM bloat_demo.orders;
\timing off
