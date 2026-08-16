# 预期输出结构（数字均为待实测占位）

以下结构用于对照实跑输出。`<待实测>` 处跑完脚本后回填，并注明机器型号、PostgreSQL 版本、是否改过 autovacuum 参数。

## 01_create_and_seed.sql

```
 rows
-------
 100000
```

## 03_measure_bloat.sql

### pg_stat_user_tables（死元组估计）

```
 relname | n_live_tup | n_dead_tup | dead_pct_est | last_autovacuum | autovacuum_count | vacuum_count
---------+------------+------------+--------------+-----------------+------------------+--------------
 orders  |     100000 |   <待实测> | <待实测>     | NULL            |                0 |             0
```

预期 `n_dead_tup` ≈ 100000（每行 1 个死版本），`dead_pct_est` ≈ 50.0。

### 冻结年龄

```
 relname | xid_age | table_size
---------+---------+------------
 orders  |  <待实测> | <待实测>   -- age(relfrozenxid) 应在数百~数千，距 2^31 回卷线极远
```

### pgstattuple（精确比例）

```
 table_len  | tuple_count | dead_tuple_count | dead_tuple_percent | free_percent
------------+-------------+------------------+--------------------+--------------
 <待实测>   |    100000   |     <待实测>     | <待实测，预期约 40~50> | <待实测>
```

### 顺序扫描计时（膨胀态）

```
 count
--------
 100000
Time: <待实测> ms
```

## 04_vacuum_and_remeasure.sql（VACUUM 之后）

- `dead_tuple_count` ≈ 0、`dead_tuple_percent` ≈ 0.0
- `xid_age` 前移、`table_size` 基本不变（普通 VACUUM 不缩文件）
- 顺序扫描计时（清理态）`Time: <待实测> ms`，与膨胀态对比（10 万行差距应为毫秒级，看方向不看绝对值）

## 05_show_autovacuum_fires.sql

### 制造死元组后（等 1~2 秒）

```
 n_dead_tup | dead_pct | last_autovacuum | autovacuum_count | vacuum_count
------------+----------+-----------------+------------------+--------------
 <待实测，约 300000> | <待实测> | <待实测，随 04 之后手动 VACUUM 变化> | 0 | 1
```

### 等 60~90 秒后重查

```
 last_autovacuum 更新、autovacuum_count 变为 1（autovacuum 自醒清理）
 n_dead_tup 回落（清理完成）
```

## 回填要求

1. 标注 PostgreSQL 版本（`SELECT version();`）、机器、是否改过 autovacuum 相关 GUC。
2. 03/04 的顺序扫描耗时差若小于 5ms，如实写「本机一次结果，量级无差异」，不要声称稳定分界线。
3. 若实测 `dead_tuple_percent` 明显偏离 40~50%，检查是否在 02 之前又跑过 UPDATE、或 05 的 autovacuum 提前把表清了。
