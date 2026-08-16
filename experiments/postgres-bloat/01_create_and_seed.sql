-- 建 schema、建表、造 10 万行，并关掉该表 autovacuum，留出稳定的测量窗口。
-- 目标：后续 UPDATE 产生的死元组不被清理工抢走，先量出"原始膨胀"。
-- 环境：PostgreSQL 16（docker run --name pg-bloat -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16）
-- 运行：docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < experiments/postgres-bloat/01_create_and_seed.sql
--
-- 注意：生产环境不要长期关 autovacuum；这里只为复现测量，用完记得在 05 脚本里重新打开。

\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS bloat_demo;

DROP TABLE IF EXISTS bloat_demo.orders;
CREATE TABLE bloat_demo.orders (
  id      serial PRIMARY KEY,
  user_id int  NOT NULL,
  status  int  NOT NULL DEFAULT 0,
  amount  numeric(12,2) NOT NULL,   -- 非索引列：UPDATE 走 HOT，索引不膨胀，膨胀集中在堆
  note    text NOT NULL
);

-- 只关掉 autovacuum：反回卷强制 vacuum（age 超 autovacuum_freeze_max_age）仍会跑，但 10 万行离那很远。
ALTER TABLE bloat_demo.orders SET (autovacuum_enabled = false);

-- 10 万行，每行 note 约 40+ 字符，页能放下，膨胀率按字节计。
INSERT INTO bloat_demo.orders (user_id, status, amount, note)
SELECT (g % 10000) + 1,
       (g % 10)::int,
       round((random() * 1000)::numeric, 2),
       repeat('x', 40) || g::text
FROM generate_series(1, 100000) AS g;

-- 刷统计：让 pg_class.reltuples = 100000，它是阈值公式的基数。
ANALYZE bloat_demo.orders;

SELECT count(*) AS rows FROM bloat_demo.orders;
