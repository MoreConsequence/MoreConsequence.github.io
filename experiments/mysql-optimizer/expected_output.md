# 预期输出结构（数字均为待实测占位）

以下结构用于对照实跑输出。`<待实测>` 处跑完脚本后回填，并注明机器/MySQL 版本/缓冲池状态。

## 01_create_skew.sql

```
+--------+---------+-------+
| status | cnt     | pct   |
+--------+---------+-------+
|      0 | 990000  | 99.00 |
|      1 |  10000  |  1.00 |
+--------+---------+-------+
```

```
+---------------+----------+----------+----------+
| Table         | Op       | Msg_type | Msg_text |
+---------------+----------+----------+----------+
| opt_demo.orders_skew | analyze | status  | OK      |
+---------------+----------+----------+----------+
```

## 02_explain.sql（核心两行）

```
-- status = 0（99% 行）：全表
| id | select_type | table | type | key  | rows       | filtered | Extra |
|  1 | SIMPLE      | orders_skew | ALL | NULL | <待实测，约 1e6> | 99.0  | NULL |

-- status = 1（1% 行）：走索引
| id | select_type | table | type | key        | rows      | filtered | Extra |
|  1 | SIMPLE      | orders_skew | ref | idx_status | <待实测，约 1e4> | 100.0 | NULL |
```

## 03_optimizer_trace.sql（JSON 关键字段）

```json
{
  "rows_estimation": [
    { "table": "`orders_skew`",
      "range_analysis": {
        "index_dives_for_range_access": <true/false>,
        "row_estimation": { "table_scan": { "rows": <待实测> } }
      }
    }
  ],
  "considered_execution_plans": [
    { "plan_prefix": [], "access_type": "<ALL 或 ref>",
      "cost": <待实测>, "rows": <待实测> }
  ],
  "best_plan": { "cost": <待实测>, "rows": <待实测> }
}
```

## 04_compare_cost.sql（SHOW PROFILES）

```
+----------+------------+----------------------------+
| Query_ID | Duration   | Query                      |
+----------+------------+----------------------------+
|        1 | <待实测> s | SELECT COUNT(*) ... status=1 |
|        2 | <待实测> s | SELECT COUNT(*) ... status=0 |
|        3 | <待实测> s | SELECT COUNT(*) ... status=1 AND amount>500 |
+----------+------------+----------------------------+
```

预期量级：status=1（1% 行 + 回表）应明显快于 status=0（全表扫），
除非缓冲池把所有页都装下且机器极快——此时差距缩小，正文需注明是热缓存。
