-- 最终干净实验: 同一会话一次性完成"统计新鲜 → 分布崩塌 → 同会话 EXPLAIN"
USE stats_drift;
DROP TABLE IF EXISTS clean_t;
CREATE TABLE clean_t (
  id INT PRIMARY KEY AUTO_INCREMENT,
  a INT NOT NULL, KEY idx_a(a)
) ENGINE=InnoDB STATS_AUTO_RECALC=0;
SET SESSION cte_max_recursion_depth = 600000;
INSERT INTO clean_t (a) WITH RECURSIVE seq AS (SELECT 1 x UNION ALL SELECT x+1 FROM seq WHERE x<500000) SELECT x%100 FROM seq;
ANALYZE TABLE clean_t;
SELECT '== A. 统计新鲜(analyze 后) ==' AS note;
EXPLAIN SELECT * FROM clean_t WHERE a = 5;
EXPLAIN SELECT * FROM clean_t WHERE a = 55;
EXPLAIN SELECT * FROM clean_t WHERE a BETWEEN 50 AND 60;
UPDATE clean_t SET a = 5;
SELECT '== B. 全表改 a=5 后, 不 ANALYZE(同一会话同一秒) ==' AS note;
EXPLAIN SELECT * FROM clean_t WHERE a = 5;
EXPLAIN SELECT * FROM clean_t WHERE a = 55;
EXPLAIN SELECT * FROM clean_t WHERE a BETWEEN 50 AND 60;
SELECT '== C. 实际行数 ==' AS note;
SELECT COUNT(*) AS a5 FROM clean_t WHERE a=5;
SELECT COUNT(*) AS a55 FROM clean_t WHERE a=55;
SELECT COUNT(*) AS range5060 FROM clean_t WHERE a BETWEEN 50 AND 60;
