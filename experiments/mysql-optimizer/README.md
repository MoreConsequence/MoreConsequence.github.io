# mysql-optimizer：为什么索引在但优化器不走

配套文章：`content/posts/mysql-optimizer-explain-cost.md`（draft:true）。

验证『索引存在 ≠ 会被用』：用 100 万行倾斜分布数据（status 低基数、user_id 高基数），
对比低选择性/高选择性等值查询的 EXPLAIN 路径与实测耗时，并用 optimizer_trace 对账代价数字。

## 环境

- MySQL 8.0（EXPLAIN FORMAT=TREE 需 8.0.16+，EXPLAIN ANALYZE 需 8.0.18+）
- 无 MySQL 时：`docker run -e MYSQL_ALLOW_EMPTY_PASSWORD=1 -p 3306:3306 mysql:8.0`
  （首次需给 `root` 配可连接的 host 或用 `mysql -u root -h 127.0.0.1`）

## 运行顺序

```bash
mysql -u root < experiments/mysql-optimizer/01_create_skew.sql          # 建库/建表/造 100 万行 + 刷统计
mysql -u root opt_demo < experiments/mysql-optimizer/02_explain.sql     # 11 条查询的 EXPLAIN / TREE / ANALYZE
mysql -u root opt_demo < experiments/mysql-optimizer/03_optimizer_trace.sql  # 看 rows_estimation 与 cost
mysql -u root opt_demo < experiments/mysql-optimizer/04_compare_cost.sql     # 走索引 vs 全表实测耗时
```

## 预期结论（方向性，数字见 expected_output.md）

| 查询 | 期望 type / key | 期望 Extra |
| :--- | :--- | :--- |
| `status = 0`（99% 行） | ALL / NULL | （无） |
| `status = 1`（1% 行） | ref / idx_status | （回表） |
| `user_id = 123` | ref / idx_user | （回表） |
| `vcode LIKE 'v12%'` | range / idx_vcode | Using index condition |
| `vcode LIKE '%12'` | ALL / NULL | Using where |
| `YEAR(created_at) = 2026` | ALL / NULL | Using where |
| `vcode = 123`（隐式转换） | ALL / NULL | Using where |
| `SELECT user_id WHERE user_id=123` | ref / idx_user | **Using index** |
| `... ORDER BY amount DESC` | ref / idx_user | **Using filesort** |

## 待回填的【本机实测待补】

1. 02 脚本第 2/3/11 条的实际 `rows` 与 `EXPLAIN ANALYZE` 的 actual rows/耗时。
2. 04 脚本 SHOW PROFILES 输出的三条 Duration（走索引 / 全表 / 回表+过滤）。
3. optimizer_trace 里两案的最终 `cost` 数字。

回填时写明：MySQL 版本、innodb_buffer_pool_size、是否冷缓存（是否重启过 mysqld）、
跑在什么机器上。单次结果只能称『本机一次结果』，不要当稳定分界线。

## 已知限制

- `RAND()` 无种子，数据每次生成不同，但分布量级一致（约 99%/1%、每 user_id 约 10 行）。
- `status=0` 的查询在 `ANALYZE` 之后统计是新的，仍选全表——这正好证明『统计新鲜 ≠ 一定走索引』，
  低选择性本来就该全表。
