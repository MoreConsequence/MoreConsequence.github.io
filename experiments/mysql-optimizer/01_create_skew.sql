-- 建带倾斜分布的表：status=0 占 99%、status=1 占 1%，共 100 万行。
-- 用途：验证"索引存在但优化器不选"——低选择性等值（status=0）应走全表扫，
--       高选择性等值（status=1）应走索引。
-- 环境：MySQL 8.0（EXPLAIN ANALYZE 需 8.0.18+）。
-- 运行：mysql -u root < experiments/mysql-optimizer/01_create_skew.sql
--
-- 说明：amount / vcode / created_at 由 RAND() 生成，数值带随机性但量级与分布一致；
--       RAND() 无种子，重复执行得到的数据不同，不影响本实验的结论方向。

CREATE DATABASE IF NOT EXISTS opt_demo;
USE opt_demo;

DROP TABLE IF EXISTS orders_skew;
CREATE TABLE orders_skew (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,             -- 高基数：1..100000，平均每值约 10 行
  status TINYINT NOT NULL,          -- 低基数：0 占 99%，1 占 1%
  amount DECIMAL(10,2) NOT NULL,
  vcode VARCHAR(32) NOT NULL,       -- 唯一字符串，用于演示 LIKE 前缀与隐式类型转换
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_user (user_id),
  KEY idx_status (status),
  KEY idx_vcode (vcode)     -- 用于演示：前缀 LIKE 可走、%前缀 LIKE 失效、隐式转换失效
) ENGINE=InnoDB;

-- 递归 CTE 造 100 万行；cte_max_recursion_depth 默认 1000，必须放宽。
SET SESSION cte_max_recursion_depth = 1000000;

INSERT INTO orders_skew (user_id, status, amount, vcode, created_at)
WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 1000000
)
SELECT
  (n % 100000) + 1,          -- user_id 1..100000
  IF(n % 100 = 0, 1, 0),     -- 每 100 行一个 status=1 → 约 1%
  ROUND(RAND() * 1000, 2),   -- amount 0.00..1000.00
  CONCAT('v', n),            -- vcode 唯一
  '2020-01-01' + INTERVAL (n % 1461) DAY
FROM seq;

-- 核对分布：status=0 应约 990000 行，status=1 应约 10000 行。
SELECT status, COUNT(*) AS cnt, ROUND(COUNT(*) / 1000000 * 100, 2) AS pct
FROM orders_skew GROUP BY status;

-- 刷新统计，确保后面 EXPLAIN 用的 cardinality 与当前数据一致。
ANALYZE TABLE orders_skew;
