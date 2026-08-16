-- 11 条查询的 EXPLAIN：看 type / rows / filtered / Extra 四列。
-- 运行：mysql -u root opt_demo < experiments/mysql-optimizer/02_explain.sql
-- 前置：先跑 01_create_skew.sql。
--
-- 阅读重点：
--   1) 与 2) 是本文核心反直觉：同一条索引 idx_status，低选择性(99%)走 ALL，高选择性(1%)走 ref。
--   8) 覆盖索引 → Extra=Using index，零回表。
--   11) EXPLAIN ANALYZE 会真实执行查询，逐算子打印实际 rows 与耗时，用来和估算 rows 对账。

USE opt_demo;

-- 1) 低选择性等值（99% 行）：应 type=ALL key=NULL —— 有索引但不走
EXPLAIN SELECT * FROM orders_skew WHERE status = 0;

-- 2) 高选择性等值（1% 行）：应 type=ref key=idx_status rows≈10000
EXPLAIN SELECT * FROM orders_skew WHERE status = 1;

-- 3) 高基数列点查：应 type=ref key=idx_user rows≈10
EXPLAIN SELECT * FROM orders_skew WHERE user_id = 123;

-- 4) 前缀 LIKE（idx_vcode 存在）：应 type=range key=idx_vcode
EXPLAIN SELECT * FROM orders_skew WHERE vcode LIKE 'v12%';

-- 5) 前缀 % LIKE：起点未知 → ALL（即便 idx_vcode 存在，也用不上）
EXPLAIN SELECT * FROM orders_skew WHERE vcode LIKE '%12';

-- 6) 函数套列：索引列被套函数 → ALL（8.0.13+ 可用功能索引救）
EXPLAIN SELECT * FROM orders_skew WHERE YEAR(created_at) = 2026;

-- 7) 隐式类型转换：vcode(VARCHAR) = 数字 → 列被 cast 成 double → ALL（idx_vcode 存在也没用）
EXPLAIN SELECT * FROM orders_skew WHERE vcode = 123;

-- 8) 覆盖索引：SELECT 列全在索引里 → Extra=Using index
EXPLAIN SELECT user_id FROM orders_skew WHERE user_id = 123;

-- 9) filesort：ORDER BY 无索引列 → Extra=Using filesort
EXPLAIN SELECT * FROM orders_skew WHERE user_id = 123 ORDER BY amount DESC;

-- 10) 树形格式（8.0.16+）：输出接近执行树，便于看清回表/索引段
EXPLAIN FORMAT=TREE SELECT * FROM orders_skew WHERE status = 1;

-- 11) 真实执行（8.0.18+，会真的跑这条查询）：
--     对比估算 rows 与实际 rows/耗时，定位成本算歪的环节
EXPLAIN ANALYZE SELECT * FROM orders_skew WHERE status = 1;
