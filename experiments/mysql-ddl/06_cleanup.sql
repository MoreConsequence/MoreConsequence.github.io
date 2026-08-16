-- 实验结束：清理实验库。
-- 运行：mysql -u root < experiments/mysql-ddl/06_cleanup.sql
-- 若还有会话挂在实验上，先 KILL 对应线程，否则 DROP DATABASE 会等 MDL。
DROP DATABASE IF EXISTS ddl_demo;
