-- 场景: 统计信息过期导致执行计划漂移
-- 1) 建表: 两个索引, 均匀分布, 关闭自动重算(模拟生产上关闭 auto_recalc 的情形)
CREATE DATABASE IF NOT EXISTS stats_drift;
USE stats_drift;
DROP TABLE IF EXISTS t;
CREATE TABLE t (
  id INT PRIMARY KEY AUTO_INCREMENT,
  a INT NOT NULL,
  b INT NOT NULL,
  KEY idx_a (a),
  KEY idx_b (b)
) ENGINE=InnoDB STATS_AUTO_RECALC=0;

-- 50 万行, a 均匀 0..99, b 均匀 0..999
SET SESSION cte_max_recursion_depth = 600000;
INSERT INTO t (a, b)
WITH RECURSIVE seq AS (
  SELECT 1 AS x
  UNION ALL SELECT x + 1 FROM seq WHERE x < 500000
)
SELECT x % 100, x % 1000 FROM seq;

SELECT COUNT(*) AS rows_total FROM t;

-- 2) 刷新统计信息, 看正常估算
ANALYZE TABLE t;
SELECT '--- 新鲜统计: EXPLAIN a BETWEEN 3 AND 7 ---' AS note;
EXPLAIN SELECT * FROM t WHERE a BETWEEN 3 AND 7;

-- 3) 数据分布崩塌: 把 a 全部改成 5(基数从 100 -> 1), 统计不重算
UPDATE t SET a = 5;
SELECT '--- 分布崩塌后(未 ANALYZE): EXPLAIN a BETWEEN 3 AND 7 ---' AS note;
EXPLAIN SELECT * FROM t WHERE a BETWEEN 3 AND 7;
SELECT '--- 分布崩塌后(未 ANALYZE): EXPLAIN a = 5 AND b = 500 ---' AS note;
EXPLAIN SELECT * FROM t WHERE a = 5 AND b = 500;
SELECT '--- 实际行数: a = 5 ---' AS note;
SELECT COUNT(*) AS actual_rows FROM t WHERE a = 5;

-- 4) 刷新统计, 看估算修正与计划翻转
ANALYZE TABLE t;
SELECT '--- 刷新统计后: EXPLAIN a BETWEEN 3 AND 7 ---' AS note;
EXPLAIN SELECT * FROM t WHERE a BETWEEN 3 AND 7;
SELECT '--- 刷新统计后: EXPLAIN a = 5 AND b = 500 ---' AS note;
EXPLAIN SELECT * FROM t WHERE a = 5 AND b = 500;
