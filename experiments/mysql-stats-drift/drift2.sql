-- 更戏剧: 分布崩塌后(不 ANALYZE) vs 刷新后(ANALYZE), 同查询同数据两个计划
USE stats_drift;
DROP TABLE IF EXISTS t2;
-- STATS_PERSISTENT=1 + AUTO_RECALC=0: 统计信息只认 ANALYZE, 拒绝后台自动刷新
CREATE TABLE t2 (
  id INT PRIMARY KEY AUTO_INCREMENT,
  a INT NOT NULL,
  b INT NOT NULL,
  KEY idx_a (a),
  KEY idx_b (b)
) ENGINE=InnoDB STATS_PERSISTENT=1 STATS_AUTO_RECALC=0;

SET SESSION cte_max_recursion_depth = 600000;
INSERT INTO t2 (a, b)
WITH RECURSIVE seq AS (
  SELECT 1 AS x UNION ALL SELECT x + 1 FROM seq WHERE x < 500000
)
SELECT x % 100, x % 1000 FROM seq;
ANALYZE TABLE t2;

SELECT '=== 1. 分布崩塌前(a 均匀): EXPLAIN a = 5 ===' AS note;
EXPLAIN SELECT * FROM t2 WHERE a = 5;

-- 崩塌: 前 90% 的行的 a 都变成 5(热点值, 实际匹配 45 万行), 统计不刷新
UPDATE t2 SET a = 5 WHERE id <= 450000;
UPDATE t2 SET a = 7 WHERE id > 450000 AND id % 10 = 1; -- 再搅乱一次, 让统计更失真

SELECT '=== 2. 崩塌后未 ANALYZE(索引永久不变, 统计还以为是 5000) ===' AS note;
EXPLAIN SELECT * FROM t2 WHERE a = 5;
SELECT COUNT(*) AS actual_a5 FROM t2 WHERE a = 5; -- 实际 45 万

SELECT '=== 3. 同数据, 仅 ANALYZE 刷新统计 ===' AS note;
ANALYZE TABLE t2;
EXPLAIN SELECT * FROM t2 WHERE a = 5;

SELECT '=== 4. 双条件: b 有选择性时应该用 idx_b, 崩塌前会怎么选 ===' AS note;
EXPLAIN SELECT * FROM t2 WHERE a = 5 AND b = 500;
SELECT COUNT(*) AS actual_match FROM t2 WHERE a = 5 AND b = 500;
