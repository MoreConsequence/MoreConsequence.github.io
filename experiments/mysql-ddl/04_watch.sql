-- 会话 C：在 B 的 ALTER 等待期间，观察 processlist 与 MDL 队列，并验证"读写全排队"。
-- 运行时机：B 的 ALTER 卡住的 20 秒窗口内，从第三个终端反复执行。
--   mysql -u root ddl_demo < experiments/mysql-ddl/04_watch.sql

USE ddl_demo;

-- 1) processlist：应能看到 B 的 ALTER 处于 "Waiting for table metadata lock"
SHOW FULL PROCESSLIST;

-- 2) MDL 队列（8.0）：A 的共享锁是 GRANTED；B 的 ALTER 挂着一条排他锁请求 PENDING。
--    内部类型比教学模型细：A 的 SELECT 拿 SHARED_READ，B 的 ALTER 执行期拿 SHARED_UPGRADABLE、
--    提交切换时升级成 EXCLUSIVE——升级这一步被 A 挡着，所以 EXCLUSIVE 是 PENDING。
SELECT OBJECT_NAME, LOCK_TYPE, LOCK_STATUS, SOURCE
FROM performance_schema.metadata_locks
WHERE OBJECT_SCHEMA = 'ddl_demo' AND OBJECT_NAME = 'big_table'
ORDER BY LOCK_STATUS, LOCK_TYPE;

-- 3) "读写全排队"：B 的排他请求挂着时，连纯 SELECT 也要排进它后面（共享请求不会插到
--    排他请求前面）。想验证就把下面这行取消注释，它会卡住直到 A 提交或 B 放弃；
--    想打断就 Ctrl+C 或再开一个终端 KILL 这个查询。
-- SELECT COUNT(*) FROM big_table;
