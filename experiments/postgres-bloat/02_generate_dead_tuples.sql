-- 制造死元组：一次全表 UPDATE。
-- autocommit 下每条 UPDATE 独立提交；旧版本提交后，新版本对任何活事务可见，
-- 旧版本就成了死元组——每行 1 个死版本 + 1 个活版本。
-- 只改非索引列（amount），Postgres 走 HOT，索引不膨胀，膨胀全部集中在堆页面。
-- 环境：PostgreSQL 16，依赖 01 脚本已跑。
-- 运行：docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < experiments/postgres-bloat/02_generate_dead_tuples.sql

\set ON_ERROR_STOP on
UPDATE bloat_demo.orders SET amount = amount * 1.0001;

-- 想看更重的膨胀就取消注释再跑几轮（每轮把上一版变死元组）：
-- UPDATE bloat_demo.orders SET amount = amount * 1.0001;
-- UPDATE bloat_demo.orders SET amount = amount * 1.0001;

SELECT 'generated' AS step, count(*) AS dead_versions_created FROM bloat_demo.orders;
