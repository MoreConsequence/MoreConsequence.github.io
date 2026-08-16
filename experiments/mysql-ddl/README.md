# mysql-ddl：ALTER 的"在线"打折在哪

配套文章：`content/posts/mysql-online-ddl-mdl-lock.md`（draft:true）。

验证『Online DDL 的在线是打折的』：用 20 万行表 + 一个占着事务的长会话，
复现 `Waiting for table metadata lock`，观察 MDL 队列里共享锁（GRANTED）与
排他锁（PENDING）的对峙，再对比 INSTANT / INPLACE / COPY 三种算法的语义差异。

## 环境

- MySQL 8.0.12+（INSTANT 与 `performance_schema.metadata_locks` 需要 8.0+；8.0.12 起才有 ALGORITHM=INSTANT）
- 无 MySQL 时：`docker run -e MYSQL_ALLOW_EMPTY_PASSWORD=1 -p 3306:3306 mysql:8.0`

## 运行顺序（三个会话）

```bash
mysql -u root < experiments/mysql-ddl/01_setup.sql          # 建库建表，20 万行

# 终端 1（会话 A）：开长事务占锁，SLEEP 120 秒
mysql -u root ddl_demo < experiments/mysql-ddl/02_long_txn.sql

# 终端 2（会话 B）：趁 A 的 SLEEP 期间，发起 ALTER，20 秒后报 ERROR 1205
mysql -u root ddl_demo < experiments/mysql-ddl/03_ddl_wait.sql

# 终端 3（会话 C）：趁 B 卡住，观察 processlist 与 MDL 队列
mysql -u root ddl_demo < experiments/mysql-ddl/04_watch.sql

# 全部结束后（负对照组：A 提交后同一条 ALTER 秒回）：
mysql -u root ddl_demo < experiments/mysql-ddl/05_algorithm_compare.sql
mysql -u root < experiments/mysql-ddl/06_cleanup.sql
```

负对照组：不跑 02，直接跑 03 —— ALTER 无锁可撞，秒回成功。
这正好说明"卡住读写的是 MDL，不是重建本身"。

## 预期结论（方向性，具体输出见 expected_output.md）

| 观察点 | 期望结果 |
| :--- | :--- |
| processlist 里 B 的 ALTER | State = `Waiting for table metadata lock` |
| metadata_locks 里 A 的锁 | `SHARED_READ` / GRANTED（事务级持有） |
| metadata_locks 里 B 的锁 | `SHARED_UPGRADABLE` / GRANTED + `EXCLUSIVE` / PENDING（升级被挡） |
| B 的最终报错 | `ERROR 1205 (HY000): Lock wait timeout exceeded`（因 lock_wait_timeout=20） |
| 同时刻的纯 SELECT | 也排队（共享请求不插排他请求的队） |

## 待回填的【本机实测待补】

1. 03 脚本实际等待的秒数：把 lock_wait_timeout 从 20 调到 60，记录 ALTER 从发起到报
   1205 的实测耗时（`time mysql ...`），与长事务结束时 ALTER 秒回的耗时做对照。
2. processlist 与 metadata_locks 的实际输出文本（State 值、LOCK_TYPE/LOCK_STATUS 行）。
3. 05 脚本在 20 万行表上 INSTANT / INPLACE / COPY 三条 ALTER 各自的实测耗时，
   以及 information_schema 里 DATA_LENGTH / INDEX_LENGTH 的前后变化。

回填时写明：MySQL 版本、innodb_buffer_pool_size、是否冷缓存（是否重启过 mysqld）、
跑在什么机器上。单次结果只能称『本机一次结果』，不要当稳定分界线。

## 已知限制

- 20 万行是小表，INPLACE 的构建段几百毫秒就走完，实验焦点在 MDL 排队而非重建耗时；
  大表上构建段本身的时长与 IO 压力不在此实验覆盖。
- metadata_locks 的内部类型（SHARED_READ / SHARED_UPGRADABLE 等）随 8.0 小版本有微调，
  观察 State 字段的 `Waiting for table metadata lock` 是最稳的信号。
- 04 脚本第 3 步（验证读也被挡）默认注释，跑它会把会话 C 自己也卡住，需要另开终端 KILL。
