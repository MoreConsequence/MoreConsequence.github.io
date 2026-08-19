---
title: "统计过期不改变计划，改变的是坏的执行：InnoDB 持久统计的本机实验"
description: "MySQL 8.0.46 本机实验：UPDATE 全表 100% 行后不 ANALYZE，同一条查询估算既可能高估(a=55 估 5000 实 0 行)也可能低估(a=5 估 25 万实 50 万)。统计过期最危险的不是计划翻转，而是计划看似正确、实际代价被统计撒谎。"
publishedAt: "2026-08-19"
tags: ["MySQL", "数据库", "源码考古"]
draft: false
featured: false
---

**TL;DR：** 我原来以为"统计过期 → 执行计划漂移"是一回事——实验做下来发现不是。MySQL 8.0.46 本机实验：表 `STATS_AUTO_RECALC=0`、50 万行 `a` 均匀分布，`ANALYZE` 后 `UPDATE` 把 100% 行的 `a` 改成 5，不 `ANALYZE` 同会话内实测——**`WHERE a=55` 估算 5000 行（实际 0 行，高估 5000 倍），`WHERE a=5` 估算 25 万行（实际 50 万，低估 2 倍），`a BETWEEN 50 AND 60` 估算 98722（实际 0 行）**。索引没变、计划没变、EXPLAIN 每一列都没变——变的只有真实代价。结论翻转过来了：**统计过期最危险的不是"计划改变"，而是"计划看起来没变，执行成本被统计撒谎"**；且统计是采样近似（`innodb_stats_persistent_sample_pages` 默认只采 20 个叶子页），不是数据快照，靠一次 ANALYZE 到位是幻想。

## 一、为什么"统计"不是"快照"

InnoDB 的持久统计（`STATS_PERSISTENT=1`，8.0 默认）把关键基数存进 `mysql.innodb_index_stats` 表——但它是**采样估算**：`innodb_stats_persistent_sample_pages` 默认每索引只采样 20 个叶子页，估算出 `n_diff_pfx01`（前缀基数）、`n_leaf_pages` 等。所以统计天生带噪声；过期与否是"噪声外叠加的误差"。

关键设定：**`STATS_AUTO_RECALC=0` 只是"拒绝后台自动重算"**，它不拒绝 `ANALYZE TABLE` 的显式重算。生产里两种形态都有：有人开着自动重算（10% 行变化才触发，异步、滞后），有人干脆关掉自己做调度——本文演示的是后者，也就是"统计完全冻结"的极端形态；自动重算开着时，滞后窗口内的行为与此一致，只是窗口短些。

本机实验（`experiments/mysql-stats-drift/clean-test.sql`）：

```sql
CREATE TABLE clean_t (id INT PK AUTO_INCREMENT, a INT NOT NULL, KEY idx_a(a))
  ENGINE=InnoDB STATS_AUTO_RECALC=0;   -- 统计只认 ANALYZE
-- 50 万行, a 均匀分布 0..99(每值 5000 行)
ANALYZE TABLE clean_t;                   -- 统计：a=55 约 5000 行(准确)
UPDATE clean_t SET a = 5;                -- 100% 行改值, 不 ANALYZE
EXPLAIN SELECT * FROM clean_t WHERE a = 55;       -- rows=5000 ← 冻结
SELECT COUNT(*) FROM clean_t WHERE a = 55;        -- 实际 0 行
```

## 二、实验 1：等值查询——估算脱节，方向由分布决定

```
阶段 1(统计新鲜):
  EXPLAIN a=5   → ref idx_a rows=5000   实际 5000   ✓
  EXPLAIN a=55  → ref idx_a rows=5000   实际 5000   ✓
阶段 2(100% 行改 a=5, 不 ANALYZE, 同会话):
  EXPLAIN a=55  → ref idx_a rows=5000   实际 0 行   ✗ 高估 5000 行(方向一)
  EXPLAIN a=5   → ref idx_a rows=249828 实际 50 万   ✗ 低估 2 倍(方向二)
```

同一时刻、同一张表、同一索引，`a=55` 被高估（以为还有 5000 行，实际 0），`a=5` 被低估（以为 25 万，实际 50 万）——**估算既可能高估也可能低估，方向取决于分布怎么变、优化器拿统计怎么推**。共同点：优化器相信的基数是错的。而索引没变、计划没变、EXPLAIN 输出每一列都没变——变的是真实代价（回表次数）。这是最容易被"EXPLAIN 看着正常"骗过去的形态：慢查询排查时看到 ref + rows=5000，完全符合预期，谁也不会想到真实行为完全不同。

## 三、实验 2：范围查询——同样冻结

```
阶段 1: EXPLAIN a BETWEEN 50 AND 60 → range idx_a rows=98722  (实际约 5.5 万, 量级对)
阶段 2: 同 SQL                        → range idx_a rows=98722  (实际 0 行, 高估 10 万倍)
```

范围查询的估算同样冻结（98722 纹丝不动），而实际 0 行。注意一个本机观察到的可复现细节：**分布改变后，部分查询的估算会被更新、部分完全冻结，方向不可预测**——实验 B 中 `a=5` 跳到 249828（接近实际量级），`a=55` 与范围查询则纹丝不动。不必纠结哪条路径被触发（优化器 dive 与统计维护时机都可能介入），**两种形态的共同根因一致：优化器相信它读到的统计，而统计已与数据脱节。**生产里见到"计划突然翻转"，很大概率是同一根因的另一张脸。

## 四、实验 3：join——驱动表选择被系统性带偏

把查询换成 `small JOIN big ON big.a = small.a WHERE small.id = 50`（`big` 是 50 万行、90% 行改 a=5 的同款表）：

```
崩塌前: small const(1 行) → big ref idx_a rows=5000   ← 对
崩塌后未 ANALYZE: 完全不变(rows=5000)                    ← 实际 45 万行
```

`big` 估 5000 行参与 join，右侧成本被低估 90 倍。若 small 不是单行 const 而是 1000 行，优化器会用错误基数决定驱动表与嵌套循环顺序——**错误的不是索引，是索引的"身价"**。（`big` 的持久统计入库值：`idx_a n_diff_pfx01=0`、`n_diff_pfx02=480157`——前缀基数落在采样噪声里，ANALYZE 也救不回来。）

## 五、结论：统计是采样近似，修复要靠"路径与估算解耦"

三个实验共同的教训翻了个个：

1. **统计过期 ≠ 计划变化**。多数时候 EXPLAIN 看着完全正常，代价却被统计撒谎。排查慢查询时，"EXPLAIN 符不符合直觉"这个判定默认不可用——你看到的是采样估算。
2. **ANALYZE 不是银弹**。它只是重新采样；采样页小则噪声依旧（`n_diff_pfx01=0` 就是噪声实例）。生产上该做的是：热点表配持久统计 + 定期 ANALYZE + 大变更后主动 ANALYZE，并把 `innodb_stats_persistent_sample_pages` 从默认 20 提到 32–64。
3. **最可靠的修复是"访问路径与统计解耦"**：能用覆盖索引/常量条件就不依赖基数判断；join 顺序敏感的场景显式 `STRAIGHT_JOIN` 或改写连接条件，把优化的赌注押在确定的物理路径上，而不是压在 20 页采样的运气上。

复现：`experiments/mysql-stats-drift/clean-test.sql`（同一会话一次性完成"新鲜→崩塌→同会话 EXPLAIN"）于本机 docker `mysql:8.0.46`（另有 `drift2.sql`/`drift3.sql` 交叉验证）；EXPLAIN 原样输出与入库统计存于 `evidence/mysql-statistics-drift-plan/2026-08-19-local/`。基数估算的具体数值随采样页、表数据分布波动，但"统计过期→估算失真，方向不定→计划冻结在旧认知"的机制跨版本稳定。

下一步可执行：挑一条你生产里"明明走了索引还是很慢"的查询，跑 `EXPLAIN` 对照实际 `COUNT(*)`——若 rows 偏差超 10 倍，先把这张表列入定期 ANALYZE 名单，再回头看统计采样页配置。