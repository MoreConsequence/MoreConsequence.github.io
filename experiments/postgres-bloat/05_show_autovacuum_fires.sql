-- 演示 autovacuum 触发：重新打开 autovacuum，制造压过阈值的死元组，等它自己醒来清理。
-- 阈值默认 50 + 0.2 × reltuples；本表 reltuples=100000，即超过 20050 个死元组就会触发。
-- 触发后 autovacuum 会在 autovacuum_naptime（默认 60s）内被拉起，last_autovacuum 会更新。
-- 依赖 04 脚本（VACUUM 后 reltuples 仍是 100000）已跑。
-- 运行：docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < experiments/postgres-bloat/05_show_autovacuum_fires.sql

\set ON_ERROR_STOP on

-- 打开 autovacuum，并重置阈值参数到默认值
ALTER TABLE bloat_demo.orders SET (autovacuum_enabled = true);
ALTER TABLE bloat_demo.orders RESET (autovacuum_vacuum_threshold);
ALTER TABLE bloat_demo.orders RESET (autovacuum_vacuum_scale_factor);

-- 3 轮全表 UPDATE（每轮独立提交），制造约 30 万死元组，远超市阈值 20050
UPDATE bloat_demo.orders SET note = note;
UPDATE bloat_demo.orders SET note = note;
UPDATE bloat_demo.orders SET note = note;

-- 此刻 n_dead_tup 应已超过阈值（若显示 0，等 1~2 秒重查）
SELECT n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
       last_autovacuum,
       autovacuum_count,
       vacuum_count
FROM pg_stat_user_tables
WHERE schemaname = 'bloat_demo' AND relname = 'orders';

-- 等 60~90 秒后手动重查（或连续轮询），观察 last_autovacuum 被更新、autovacuum_count +1：
-- docker exec -i pg-bloat psql -U postgres -c "SELECT last_autovacuum, autovacuum_count, n_dead_tup FROM pg_stat_user_tables WHERE schemaname='bloat_demo' AND relname='orders';"
--
-- 横向对比：若本表有 1 亿行，同一阈值公式要 50 + 0.2×100000000 = 2000 万个死元组才触发——
-- 这就是"大表要攒约 20% 死元组才会被清理"的直观来源。
