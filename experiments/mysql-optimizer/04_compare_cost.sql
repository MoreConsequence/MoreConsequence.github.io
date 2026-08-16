-- 实测走索引 vs 走全表的耗时对比（服务端 profiling 计时）。
-- 运行：mysql -u root opt_demo < experiments/mysql-optimizer/04_compare_cost.sql
-- 前置：先跑 01_create_skew.sql。
--
-- 说明：
--   SHOW PROFILES 的 Duration 是服务端执行耗时（不含网络）。
--   缓冲池热度会影响结果：status=1 的行若全部在缓冲池，回表近乎内存读；
--   想测"冷缓存"最干净的办法是重启 mysqld 后再跑本脚本（InnoDB 没有 FLUSH TABLES 清池的等价物）。
--   本机实测数字回填到正文"走索引/全表耗时对比"的【本机实测待补】。

USE opt_demo;

SET SESSION profiling = 1;

-- 走 idx_status（约 1% 行，回表约 1 万次随机读）
SELECT COUNT(*) FROM orders_skew WHERE status = 1;

-- 走全表（约 99% 行，顺序读）
SELECT COUNT(*) FROM orders_skew WHERE status = 0;

-- 走 idx_status 但返回整行（触发 1 万次回表），对比上面 COUNT 只看索引
SELECT COUNT(*) FROM orders_skew WHERE status = 1 AND amount > 500;

SHOW PROFILES;

SET SESSION profiling = 0;
