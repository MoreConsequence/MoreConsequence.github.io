-- 会话 A：开一个长事务占住 big_table 的 MDL 共享锁（"占着茅坑"）。
-- 运行（单独一个终端，趁它 SLEEP 时去跑 03 和 04）：
--   mysql -u root ddl_demo < experiments/mysql-ddl/02_long_txn.sql
--
-- 关键机制：在显式事务里 SELECT 取得的元数据锁（SHARED_READ）会持有到事务结束，
--   而不是语句结束（autocommit 的 SELECT 才会语句结束即释放）。
--   SLEEP 不碰表，只是把事务拖住不提交，好让 03 的 ALTER 撞上这把共享锁。

USE ddl_demo;

START TRANSACTION;

-- 取得 big_table 的共享元数据锁，持有到本事务结束。
SELECT COUNT(*) FROM big_table;

-- 保持事务开启 120 秒。改大改小随意，只要比 03 的观察窗口（20 秒）长。
SELECT SLEEP(120);

COMMIT;
