-- 会话 B：在 A 的长事务开启期间，发起一条加索引的 ALTER。
-- 运行（单独一个终端，趁 A 的 SLEEP 未结束）：
--   mysql -u root ddl_demo < experiments/mysql-ddl/03_ddl_wait.sql
--
-- 预期：ALTER 走到"提交切换"要升级成排他元数据锁，撞上 A 的共享锁，
--   停在 Waiting for table metadata lock；约 20 秒后报错放弃：
--     ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction
-- 若 A 已经提交（无长事务挂着），ALTER 会秒回成功——这就是"负对照组"。

USE ddl_demo;

-- 把锁等待调成 20 秒：默认 31536000 秒（一年），真等一年没意义。
SET SESSION lock_wait_timeout = 20;

ALTER TABLE big_table ADD INDEX idx_val (val);
