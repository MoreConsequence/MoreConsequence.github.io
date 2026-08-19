USE stats_drift;
DROP TABLE IF EXISTS dive_t;
CREATE TABLE dive_t (
  id INT PRIMARY KEY AUTO_INCREMENT,
  a INT NOT NULL, KEY idx_a(a)
) ENGINE=InnoDB STATS_AUTO_RECALC=0;
SET SESSION cte_max_recursion_depth = 600000;
INSERT INTO dive_t (a) WITH RECURSIVE seq AS (SELECT 1 x UNION ALL SELECT x+1 FROM seq WHERE x<500000) SELECT x%100 FROM seq;
ANALYZE TABLE dive_t;
SELECT '== 1. 统计新鲜 ==' AS note;
EXPLAIN SELECT * FROM dive_t WHERE a = 55;
EXPLAIN SELECT * FROM dive_t WHERE a BETWEEN 50 AND 60;
UPDATE dive_t SET a = 5;  -- 100% 行变成 5, 不 ANALYZE
SELECT '== 2. 全表改 a=5 后不 ANALYZE(等值 vs 范围) ==' AS note;
EXPLAIN SELECT * FROM dive_t WHERE a = 55;      -- 等值: 持久统计 → 应该还是 5000
EXPLAIN SELECT * FROM dive_t WHERE a BETWEEN 50 AND 60;  -- 范围: index dive?
