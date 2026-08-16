-- 对比 INSTANT / INPLACE / COPY 三种算法在同表上的语义与日志量。
-- 前置：先跑 01_setup.sql；本脚本要求当前没有长事务挂着（否则会撞 MDL）。
-- 计时建议用 shell 包一层：
--   time mysql -u root ddl_demo < experiments/mysql-ddl/05_algorithm_compare.sql
-- 三个 ALTER 分开计时的干净做法是拆成三条命令各包一次 time，这里合成一个文件便于看全貌。

USE ddl_demo;

SELECT VERSION();  -- 需要 8.0.12+ 才有 INSTANT

-- INSTANT：只改元数据，不碰数据页、不加临时表空间（8.0.12+，仅在表尾加列）
ALTER TABLE big_table ADD COLUMN extra1 INT NOT NULL DEFAULT 0, ALGORITHM=INSTANT;

-- INPLACE：原地改（重建二级索引），执行期允许并发 DML（LOCK=NONE）
ALTER TABLE big_table ADD INDEX idx_val2 (val), ALGORITHM=INPLACE;

-- COPY：重建整表再切换；不支持 LOCK=NONE，这里取 LOCK=SHARED（放行读、挡写）。
-- 观察落盘：COPY 会让表空间临时变大（约多一份数据量），inplace 索引只加临时索引文件。
ALTER TABLE big_table ADD COLUMN extra2 VARCHAR(16), ALGORITHM=COPY, LOCK=SHARED;

-- 三种算法各自留下的表空间痕迹
SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'ddl_demo';
