---
title: "MySQL 为什么不走你的索引：统计信息、代价模型与 EXPLAIN 的账"
description: "把『我建了索引它为什么不用』从玄学变成可对账的账单：读 type/rows/filtered/Extra 四列，追 rows 是从 index dive 还是统计信息里来的，用 optimizer_trace 与 cost model 看懂优化器为什么选了全表扫。"
publishedAt: "2026-08-16"
tags: ["MySQL", "查询优化", "EXPLAIN", "性能"]
draft: true
featured: false
series: "数据库原理手记"
---

**TL;DR：** 建了索引不代表会被用。MySQL 优化器从不因为你建了索引就用它，它只比较两套路径的估算代价——走索引（先在索引页定位，再拿主键回表逐行取整行）vs 顺序扫全表，谁便宜选谁。它拿来估代价的输入只有两类：range 优化用的 index dives（真钻 B+Tree 数页）和一般等值选择用的统计信息（cardinality），后者可能过期、可能被倾斜分布骗。所以『我建了索引它为什么不用』绝大多数时候不是索引坏了，而是军师按当前统计下注，算下来走全表更便宜——它算错的可能是 rows，不是你的索引。读 EXPLAIN 只看 key 列会漏掉真相，type/rows/filtered/Extra 四列才是账单，optimizer_trace 能让你看到最终选路与具体代价数字。核心纪律一句话：先 ANALYZE TABLE 再下结论。

## 一、先立反直觉：索引存在 ≠ 会被用，优化器只比较代价

先摆一个必然会打脸看 `key` 列的人的场景。表 `orders_skew` 上有普通索引 `idx_status(status)`，100 万行里 99% 是 `status=0`、1% 是 `status=1`：

```sql
EXPLAIN SELECT * FROM orders_skew WHERE status = 0;
-- type=ALL  key=NULL          ← 明明有 idx_status，就是不走
EXPLAIN SELECT * FROM orders_skew WHERE status = 1;
-- type=ref  key=idx_status    rows≈10000（1% 的估算行数）
```

同一条索引，换一个常量，一条全表扫、一条走索引。不是索引坏了，是优化器对两条查询的代价估算给出了不同答案。MySQL 的优化器不认『我有索引』，只认『走这条路要花多少钱』：路径 A『走 idx_status：先扫索引页拿到主键列表，再逐行回聚簇索引取整行』；路径 B『从主键 B+Tree 顺序扫全表』。谁便宜选谁，仅此而已。

第一层认知因此是：**不走你的索引，不是军师瞎了，是军师按手头的信息算下来『走全表更便宜』。** 它下注的筹码只有统计信息，不是真实数据。它算错的往往不是『该不该用这个索引』，而是 `rows`——把某个环节的行数/页数估歪了，账单就歪了。接下来三节，把军师下注的这张账单逐项读出来。

## 二、EXPLAIN 的关键列：type、rows、filtered、Extra

看 EXPLAIN 只看 `key` 是外行读法——`key=NULL` 也可能比 `key=idx_status` 快。真正要读的是四列：`type`（访问方式）、`rows`（估算扫描行数）、`filtered`（表条件过滤后剩多大比例，0–100）、`Extra`（额外动作）。官方文档给出的 `type` 语义按好到差排：

| type | 语义 | 典型出现 |
| :--- | :--- | :--- |
| const / system | 最多匹配一行，开查前就读出 | 主键或唯一索引按常量点查 |
| eq_ref | 对前面表每一行组合，本表最多匹配一行 | 主键/唯一非空索引做连接 |
| ref | 匹配到多行 | 非唯一索引等值、最左前缀 |
| range | 索引范围扫描 | BETWEEN / IN / LIKE 'abc%' / >= |
| index | 扫整棵索引树 | 覆盖索引全量、无 WHERE |
| ALL | 全表扫描 | —— |

（`type` 之间还夹着 `fulltext / ref_or_null / index_merge / unique_subquery / index_subquery` 几档，日常调优基本碰不到，就不展开。）

排序里最关键的一句：**`type=ALL` 不等于慢，`type=ref` 不等于快。** 决定速度的是 `rows` 估算和回表次数。`rows` 是估算不是实际行数——官方文档原文是『MySQL 认为为了执行查询必须检查的行数』，它基于统计信息推出来，可能和真实差一个量级。`filtered` 表示经过表条件后还剩多大比例，`rows × filtered / 100` 才是进入下一步连接的『有效行数』，`filtered` 越小说明越多行会被后置条件过滤掉。

`Extra` 的四个高频值：

| Extra | 含义 |
| :--- | :--- |
| `Using index` | 只读索引树就够了，零回表（覆盖索引） |
| `Using index condition` | 索引下推（ICP）：能下推的谓词先在索引层过滤，剩下的才回表 |
| `Using where` | 取到行后还要再判一次条件；单独出现不算差，配合大 `rows` 才是差 |
| `Using filesort` | 排序要另做一趟，可能走内存也可能落磁盘 |

`Using index` 与 `Using index condition` 的区别、以及覆盖索引把回表次数归零的完整账，见[回表为什么贵](/writing/covering-index-avoid-back-to-table)。

## 三、rows 从哪来：index dives 与统计信息

`rows` 不是拍脑袋，有两种来源，对应两类查询：

1. **range 优化用 index dives**。对 `WHERE col BETWEEN a AND b`、`IN (...)`、`LIKE 'x%'` 这类区间，优化器会真的『潜水』进 B+Tree，沿区间左右界各扫几页，数出区间里大约多少行——这叫 index dive，准，但贵（要真碰索引页）。
2. **一般等值选择用统计信息**。`WHERE status = 0` 这种，直接用索引基数（cardinality）估计——索引里有几个不同的值，结合表行数推算每个等值大概命中多少行。

两者之间的开关是系统变量 `eq_range_index_dive_limit`，官方文档默认 **200**：`IN` 列表的值个数等于或超过 200 时，优化器从 index dive 退化为统计估算——为了 200 个值钻 200 次 B+Tree 太贵，主动放弃精度。

统计信息本身来自 InnoDB 的抽样，几个官方文档给出的默认值与行为：

- `innodb_stats_persistent` 默认 **ON**：统计落盘到 `mysql.innodb_table_stats` 与 `mysql.innodb_index_stats`（后者 `n_diff_pfxNN` 就是各前缀的不同值个数，也就是 cardinality）。
- `innodb_stats_persistent_sample_pages` 默认 **20**：每次分析抽样 20 页索引页来估基数。抽样就有误差，倾斜分布上误差会被放大。
- `innodb_stats_auto_recalc` 默认 **ON**：行数变化超过约 10% 时，InnoDB 在**后台异步**重算统计。注意『后台』和『异步』：刚灌完 100 万行、刚删掉一大片数据，统计很可能还是旧的。

所以 `ANALYZE TABLE orders_skew;` 该什么时候跑：**大批量导入/删除之后、或者你确认分布变了但 auto_recalc 来不及反应时。** 另外 8.0 引入直方图，`ANALYZE TABLE t UPDATE HISTOGRAM ON col WITH 100 BUCKETS;` 能补**非索引列**的选择性——那些没索引、但在过滤和 join 里很重要的列，统计信息原本根本不采。

## 四、代价模型：MySQL 8 的价目表

MySQL 8 的代价模型 `cost_model=2`，成本项全在两张系统表里：`mysql.server_cost`（操作级）与 `mysql.engine_cost`（引擎级）。官方文档给出的默认价目：

| 成本项 | 默认值 | 含义 |
| :--- | :--- | :--- |
| `row_evaluate_cost` | 0.1 | 评估一行记录的条件（5.7 为 0.2，8.0 起为 0.1，以 `mysql.server_cost` 实值为准） |
| `key_compare_cost` | 0.05 | 比较一次键值 |
| `io_block_read_cost` | 1.0 | 从磁盘读一页（InnoDB 一页 16KB） |
| `memory_block_read_cost` | 0.25 | 从缓冲池读一页 |

注意 `io_block_read_cost / memory_block_read_cost = 4`：**默认模型里，磁盘页读按内存页读的 4 倍计价**。这是官方文档给的原生默认，不是本机测的。优化器的『总代价』大致由两块构成：`rows × row_evaluate_cost`（行评估费，8.0 默认每行 0.1）加上 `页数 × 页读费`。

于是『走全表更便宜』的机制就清楚了。全表扫：每页只读一次，`M` 页 × 1.0，顺序读。走二级索引：先在索引页定位，**然后每个命中行都要回表一次**——命中行散落各处时，就是 `N` 次随机页读。当 `N` 大到接近 `M` 的量级，`N × 1.0` 的随机读就压过 `M × 1.0` 的顺序读，全表赢；这还没算 `rows × 0.1` 的行评估费。行业里常说的『命中超过约 20–30% 全表更优』只是经验线，不是官方数字——真正的裁判永远是当前统计下的代价估算，而统计会变。

**翻车点就在这里**：代价 = rows × 单价，rows 是第三节那种『抽样 + 可能过期』的估算。统计一过期、分布一倾斜，rows 就是假的，账单就是假的，军师按假账单下注，自然出现『明明有索引却不走』。

## 五、常见翻车清单：对账到具体算子

以下每条给『期望走索引、实际不走』的反例与机制。前四条是写法问题，后几条是数据/工具问题。

**1. 前缀通配 `%LIKE%`。** B+Tree 只能从确定前缀开始定位：

```sql
WHERE vcode LIKE 'v12%'   -- 可走 range
WHERE vcode LIKE '%12'    -- 全表扫：起点未知，索引无从定位
```

**2. 函数套列。** 对索引列套函数，索引里存的值和函数结果对不上：

```sql
WHERE YEAR(created_at) = 2026   -- ALL（前提：数据跨多年，2026 只占一小部分）
```

8.0.13 起可用功能索引兜底：`CREATE INDEX idx_year ON orders_skew ((YEAR(created_at)));`。注意这个例子要成立，数据必须跨多个年份——如果所有行都落在 2026，100% 选择性下全表本来就是正解，跟『套函数』无关，反例就演示不出来（实验 SQL 用 `'2020-01-01' + INTERVAL (n % 1461) DAY` 覆盖 4 年）。

**3. 隐式类型转换。** 规则一句话：**被转换的是索引列就失效，被转换的是常数就没事**：

```sql
WHERE vcode = 123          -- vcode 是 VARCHAR，列被转成数字 → ALL
WHERE user_id = '123'      -- user_id 是 INT，字符串常数被转成数字 → 索引可用
```

隐式转换不只是性能问题，是语义问题——比较规则变了，结果都可能不同。库存扣减里把类型和比较语义对清楚，永远排在谈索引前面[秒杀不是削峰](/writing/seckill-inventory-atomic-gates)。

**4. `OR` 无法合并。** `WHERE a = 1 OR b = 2`，a 有索引、b 没有：MySQL 没法只用 a 的索引捞出 b 的命中，除非触发 index_merge（代价估算通常不划算）。改成 `UNION`，或给 b 也建索引。

**5. 统计过期 + 分布倾斜。** 第三节的机制：`ANALYZE TABLE` 刷新。对低基数列（如 `status`），用 `SHOW INDEX` 看 Cardinality，再和真实分布比对，确认统计是否还可信。

**6. 回表太多。** 索引选对了，但命中行数大、每行都回表，Extra 大量出现没有 `Using index` 的行。解法是把查询要的列并进索引，靠覆盖索引把回表归零——完整账本见[回表为什么贵](/writing/covering-index-avoid-back-to-table)。

**7. `ORDER BY` 无索引 → `Using filesort`。** filesort 不必然落盘（行数小时就在内存排），但它意味着一趟额外的排序。`(user_id, amount)` 联合索引能让 `WHERE user_id=? ORDER BY amount` 直接在索引里有序。注意排序方向要和索引一致，`DESC` 撞上升序会让排序优化白费（8.0 有降序索引）。

**8. 把军师拉出来对账：optimizer_trace 与 EXPLAIN ANALYZE。** 前面七条都是猜，真正拿出账本是这两个：

```sql
SET optimizer_trace='enabled=on';
EXPLAIN SELECT * FROM orders_skew WHERE status = 1;
SELECT * FROM information_schema.OPTIMIZER_TRACE\G
SET optimizer_trace='enabled=off';
```

trace 里找两段：`rows_estimation`（看用的是 index dive 还是统计、估了多少行）和 `considered_execution_plans`（看最终选路的 `cost` 数字）。8.0.18+ 还有 `EXPLAIN ANALYZE`——它会**真正执行**这条 SQL，逐算子打印实际 rows 与实际耗时，和 EXPLAIN 的估算 rows 摆在一起，一眼看出估算差了几倍、差在哪个算子。

## 六、结论：三步法 + 一条纪律

能查慢 SQL 的三步：

1. **先 `ANALYZE TABLE`**，把统计刷新到当前数据，先把『统计过期』这个变量排除掉。
2. **`EXPLAIN` 读四列**：`type` 看访问方式，`rows` 看估算，`filtered` 看过滤效率，`Extra` 看回表/filesort/ICP。
3. **`optimizer_trace` 或 `EXPLAIN ANALYZE` 对账**：估算 rows vs 实际 rows，定位成本算歪的环节——是统计歪了，还是回表页数被低估了。

一条纪律：**先 ANALYZE 再下结论。** 在统计过期的前提下判『索引无效』，等于拿过期的价目表冤枉军师。绝大多数『我建了索引它为什么不用』，先刷新统计再看 EXPLAIN，答案自己就出来了；剩下的，用 trace 对账到具体算子。索引路径收窄的还有行锁范围——扫全表锁 100 万行、走索引只锁区间，这个连锁效应的因果见[死锁不是靠重试](/writing/database-deadlock-wait-graph)。

诚实说局限：EXPLAIN 的 rows 永远是估算，`EXPLAIN ANALYZE` 也只证明本机这一次执行。生产环境请以真实流量 + 压测为准，不能拿一次 EXPLAIN 当结论。

## 实验入口

本仓库 `experiments/mysql-optimizer/` 提供可运行脚本（MySQL 8.0，环境与预期输出见 `README.md` 与 `expected_output.md`）：

```bash
mysql -u root < experiments/mysql-optimizer/01_create_skew.sql          # 建 100 万行倾斜数据
mysql -u root opt_demo < experiments/mysql-optimizer/02_explain.sql     # 11 条查询的 EXPLAIN / FORMAT=TREE / ANALYZE
mysql -u root opt_demo < experiments/mysql-optimizer/03_optimizer_trace.sql  # 看 rows_estimation 与 cost
mysql -u root opt_demo < experiments/mysql-optimizer/04_compare_cost.sql     # 走索引 vs 全表的实测耗时
```

正文里的 `rows≈10000` 是为说明倾斜分布而写的预期量级，不是当前运行输出；走索引/全表耗时也尚未取得带 MySQL 版本和配置快照的原始结果，因此不作性能结论。跑完以上脚本后应把 EXPLAIN、optimizer_trace 和耗时原始输出一起保存。文中各成本项默认值来自官方文档，可直接用 `SELECT * FROM mysql.server_cost;` 与 `SELECT * FROM mysql.engine_cost;` 核实。

## 参考资料

1. MySQL 8.0 官方：EXPLAIN 输出格式（type 排序、rows/filtered 语义、Extra 取值）—— https://dev.mysql.com/doc/refman/8.0/en/explain-output.html
2. MySQL 8.0 官方：优化器代价模型（server_cost/engine_cost 默认值）—— https://dev.mysql.com/doc/refman/8.0/en/cost-model.html
3. MySQL 8.0 官方：eq_range_index_dive_limit（默认 200）—— https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_eq_range_index_dive_limit
4. MySQL 8.0 官方：配置优化器统计（innodb_stats_persistent / sample_pages / auto_recalc / 直方图）—— https://dev.mysql.com/doc/refman/8.0/en/innodb-optimizer-statistics.html
5. MySQL 8.0 官方：EXPLAIN ANALYZE（8.0.18+）—— https://dev.mysql.com/doc/refman/8.0/en/explain-analyze.html
6. MySQL 8.0 官方：索引条件下推 ICP —— https://dev.mysql.com/doc/refman/8.0/en/index-condition-pushdown-optimization.html

> 延伸阅读：回表与覆盖索引的完整账见[回表为什么贵](/writing/covering-index-avoid-back-to-table)；『语义先于性能』的坑在并发扣减里同样致命，见[秒杀不是削峰](/writing/seckill-inventory-atomic-gates)；扫描范围决定锁范围，锁与等待图的因果见[死锁不是靠重试](/writing/database-deadlock-wait-graph)。
