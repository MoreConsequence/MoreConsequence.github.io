# postgres-bloat：一次 UPDATE 之后，表里躺着多少死元组

配套文章：`content/posts/postgres-bloat-autovacuum.md`（draft:true）。

验证三件事：

1. **「删掉的行其实还在」**——一次全表 UPDATE 在 autocommit 下提交后，旧版本全部变成死元组，占着页面。
2. **膨胀可以量**——`pg_stat_user_tables.n_dead_tup` 给估计，`pgstattuple.dead_tuple_percent` 给精确的「死元组占表字节比例」；普通 `VACUUM` 让比例归零、但表文件大小基本不变。
3. **autovacuum 会在阈值被压过后自动醒来**——阈值默认 `50 + 0.2 × reltuples`，触发后约一个 `autovacuum_naptime`（60s）内 `last_autovacuum` 更新。

## 环境

- PostgreSQL 16，Docker：`docker run --name pg-bloat -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`
- 连接：`docker exec -i pg-bloat psql -U postgres`

## 运行顺序

```bash
D=experiments/postgres-bloat
docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < $D/01_create_and_seed.sql          # 建表造 10 万行 + 关表级 autovacuum + ANALYZE
bash $D/02_generate_dead_tuples.sh                                                                    # 两会话：长事务拖快照 + 全表 UPDATE → 10 万死元组
docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < $D/03_measure_bloat.sql              # n_dead_tup / pgstattuple / age(relfrozenxid) / 扫描计时
docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < $D/04_vacuum_and_remeasure.sql       # VACUUM 后重测：比例归零、文件大小不变
docker exec -i pg-bloat psql -U postgres -v ON_ERROR_STOP=1 < $D/05_show_autovacuum_fires.sql      # 重开 autovacuum，制造 30 万死元组，等它自醒
```

为什么 02 必须是两会话，而不是一条 autocommit UPDATE？PG16 实测：autocommit 单条 UPDATE 提交后旧版本对新快照立即可见性消失，插入路径会顺势 prune 掉它们，`pgstattuple` 里 `dead_tuple_count` 归零（页面只显示 `free_percent` 上涨）；要看到真实的死元组积累，必须先有一个 REPEATABLE READ 快照事务钉住旧版本，UPDATE 提交后再放它走——这正是 `02_generate_dead_tuples.sh` 做的事，也对应正文第三节「最老快照拖住，回收就无从谈起」。

跑完后按 expected_output.md 的结构回填数字，并注明：PostgreSQL 版本、是否修改过 autovacuum 参数、机器型号。单次结果只能称「本机一次结果」，不要当稳定分界线。

## 预期结论（方向性）

- 02 之后，`n_dead_tup` 约等于行数（每行 1 个死版本），`dead_tuple_percent` 实测 **44.3%**（2026-08-18 本机：macOS / Apple Silicon / postgres:16-alpine，表现路径 `evidence/postgres-bloat/2026-08-18-local/run.log`）。
- 03 到 04：`dead_tuple_percent` 从 44.3% 降到 0%；`pg_relation_size` 前后基本不变（19MB）——**普通 VACUUM 不缩文件**。
- 05 之后 60~90s 内 `last_autovacuum` 更新、`autovacuum_count` +1（实测 65s，`n_dead_tup` 从 299770 清到 0）。
- 顺序扫描 `SELECT count(*)` 的耗时，膨胀态应慢于清理态（10 万行差距可能只有几毫秒到几十毫秒，量级才是结论）。

## 可选扩展：挂起事务把死元组拖住（bloat 最常见帮凶）

在一个会话里保持快照，另一个会话做 UPDATE，VACUUM 就回收不了死元组：

```bash
docker exec -i pg-bloat psql -U postgres &
# 会话 A（保持快照，别退出）：
#   BEGIN; SELECT count(*) FROM bloat_demo.orders;  -- 之后一直挂着
# 会话 B：
#   docker exec -i pg-bloat psql -U postgres -c "UPDATE bloat_demo.orders SET note=note;"
#   docker exec -i pg-bloat psql -U postgres -c "VACUUM bloat_demo.orders;"
#   docker exec -i pg-bloat psql -U postgres -c "SELECT dead_tuple_percent FROM pgstattuple('bloat_demo.orders');"
# → 死元组比例不降（OldestXmin 被会话 A 拖住）
# 会话 A 执行 COMMIT 后再 VACUUM，比例才归零。
```

## 已知限制

- `RAND()` 无种子，数据每次不同，但不影响量级与结论方向。
- 表只改了非索引列，走 HOT：本实验量的是**堆**膨胀，索引不膨胀；生产里 UPDATE 索引列会把膨胀分一半给索引。
- 10 万行的顺序扫描耗时差很小，重点是「死元组比例」这个稳定指标，不是绝对毫秒数。
- 关表级 autovacuum 只为稳定复现；生产不要长期关。
