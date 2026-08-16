-- 打开 optimizer trace，看优化器对 status=1（走索引）vs status=0（全表）的代价估算。
-- 运行：mysql -u root opt_demo < experiments/mysql-optimizer/03_optimizer_trace.sql
-- 前置：先跑 01_create_skew.sql。
--
-- 阅读重点（JSON 里找）：
--   rows_estimation → table_scan: rows=...（全表估算行数）
--                      range_analysis: index_dives_for_range_access=true/false
--                                        index_dive / index_statistics（这次估算走 dive 还是统计）
--   considered_execution_plans → 最终选路的 "cost" 数字
--   best_plan / chosen_plan → 是否选了全表扫（table_scan 或 idx_status）

USE opt_demo;

SET SESSION optimizer_trace = 'enabled=on';
SET SESSION optimizer_trace_max_mem_size = 1048576;

-- 案例一：低选择性等值（99%），预期 trace 里最终 cost 显示全表扫更便宜
EXPLAIN SELECT * FROM orders_skew WHERE status = 0;
SELECT * FROM information_schema.OPTIMIZER_TRACE\G

-- 案例二：高选择性等值（1%），预期最终 cost 显示走 idx_status 更便宜
EXPLAIN SELECT * FROM orders_skew WHERE status = 1;
SELECT * FROM information_schema.OPTIMIZER_TRACE\G

SET SESSION optimizer_trace = 'enabled=off';
