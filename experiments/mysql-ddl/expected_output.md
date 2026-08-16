# mysql-ddl 期望输出（方向性，非本机实测）

以下内容用于判断脚本是否按预期工作；实际值需在作者本机回填到
`content/posts/mysql-online-ddl-mdl-lock.md` 的【本机实测待补】。

## SHOW FULL PROCESSLIST（会话 C，B 卡住时）

```text
+----+------+-----------+---------+------+---------------------------------+-------------------------------------------------+
| Id | User | db        | Command | Time | State                           | Info                                            |
+----+------+-----------+---------+------+---------------------------------+-------------------------------------------------+
| 11 | root | ddl_demo  | Query   |   9  | Waiting for table metadata lock | ALTER TABLE big_table ADD INDEX idx_val (val)   |
+----+------+-----------+---------+------+---------------------------------+-------------------------------------------------+
```

`Time` 会随观察时机变化；核心信号是 `State = Waiting for table metadata lock`。

## performance_schema.metadata_locks（B 卡住时）

```text
+-----------+-------------------+---------------+------------------------------------------+
| OBJECT_NAME | LOCK_TYPE        | LOCK_STATUS   | SOURCE                                   |
+-----------+-------------------+---------------+------------------------------------------+
| big_table | SHARED_READ       | GRANTED       | sql_parse.cc ...                          |  <- 会话 A 的 SELECT，事务级持有
| big_table | SHARED_UPGRADABLE | GRANTED       | ...                                      |  <- 会话 B 的 ALTER，执行期持有
| big_table | EXCLUSIVE         | PENDING       | ...                                      |  <- 会话 B 的 ALTER，提交切换升级被挡
+-----------+-------------------+---------------+------------------------------------------+
```

> 说明：内部 MDL 类型比"SHARED / EXCLUSIVE"两分法更细，且随 8.0 小版本有微调；
> 方向的稳定信号是"有一个共享锁 GRANTED、一个排他锁 PENDING"，以及 processlist 的 State。

## 03_ddl_wait.sql 的最终报错（A 未提交、20 秒后 B 放弃）

```text
ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction
```

## 05_algorithm_compare.sql 的期望（20 万行小表，方向性）

- INSTANT 加列：接近瞬时（只改元数据），DATA_LENGTH 不变。
- INPLACE 加索引：INDEX_LENGTH 变大（新增 idx_val2 的叶子页），DATA_LENGTH 不变。
- COPY 加列：DATA_LENGTH 临时接近翻倍（重建整表再切换），结束后回落。

具体耗时与字节数等待作者本机回填。
