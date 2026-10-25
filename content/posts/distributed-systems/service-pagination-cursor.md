---
title: "分页架构深度解析：从 OFFSET 漂移重行到 Cursor 游标寻址"
description: "在高并发读写场景下，基于 OFFSET 的分页不仅会面临 O(N) 的深分页扫描延迟，还会在并发写入时产生严重的数据重复与空洞。本文通过 SQLite 实验实测重行现象，推导 Keyset 游标寻址与复合索引设计原理。"
publishedAt: "2026-09-14"
updatedAt: "2026-10-21"
tags: ["API 设计", "分页机制", "数据库索引", "SQLite", "系统设计"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 列表分页机制的选择决定了数据一致性与数据库性能下限。在按时间倒序排列的动态列表中，如果在用户请求第一页（5 条）后系统并发写入 2 条新数据，基于 `OFFSET 5` 获取的第二页与第一页会重叠 2 行数据。写入频率越高，重复数据越多。基于 `WHERE ts < last_seen_ts` 的游标分页（Cursor / Keyset Pagination）彻底消除了重行现象，末位与首位精确差 1 衔接。游标方案依托复合 B-Tree 索引可实现常数级 \( O(\log N) \) 快速定位，消除深分页全表扫描，代价是无法直接支持指定页码跳转。

## 一、传统 OFFSET 分页的两大致命缺陷

Web 应用程序中最直观的分页方式是使用 SQL 的 `LIMIT` 和 `OFFSET` 子句。客户端传入 `page_no` 和 `page_size`，服务端将其转换为：

```sql
SELECT * FROM feed ORDER BY created_at DESC LIMIT 5 OFFSET 5;
```

这种方案实现极简，在只读静态后台中尚可运行。但在高并发业务场景中，它存在两个致命缺陷。

### 1. 并发写入下的数据重叠与遗漏

考虑一个倒序排列的 Feed 流。数据表初始包含自增 ID 从 20 到 1 的 20 条记录。
用户请求第一页（`LIMIT 5 OFFSET 0`），获得记录 `[20, 19, 18, 17, 16]`。

在用户翻看第一页的瞬间，系统并发写入了两条新记录（ID 为 21 和 22）。此时表中前 5 条记录变成了 `[22, 21, 20, 19, 18]`。
用户滑动屏幕加载第二页（`LIMIT 5 OFFSET 5`）。数据库跳过当前的前 5 条记录，返回紧随其后的 5 条记录：`[17, 16, 15, 14, 13]`。

```text
初始状态: [20, 19, 18, 17, 16] [15, 14, 13, 12, 11] ...
第一页获取: [20, 19, 18, 17, 16]

写入新数据: [22, 21] 插入头部
当前数据: [22, 21, 20, 19, 18, 17, 16, 15, 14, 13] ...

第二页 (OFFSET 5):
跳过前 5 条 [22, 21, 20, 19, 18]
实际返回:   [17, 16, 15, 14, 13]
                 ▲   ▲
                 这两条记录在第一页已经出现过！
```

用户在第二页重复看到了 `[17, 16]` 两条记录。如果并发删除数据，则会导致部分数据被静默跳过。写入越频繁，列表越失真。

### 2. 深分页的全表扫描开销

当用户或爬虫访问深层页面（如 `OFFSET 100000 LIMIT 10`）时，数据库引擎无法直接跳至第 10 万行。
存储引擎必须从索引树的起始位置依次扫描并物化前 100,010 条记录，随后丢弃前 100,000 条，仅返回最后 10 条。
查询耗时随偏移量呈线性关系 \( O(N) \) 恶化，极易导致数据库 CPU 满载与慢查询堆积。

## 二、Cursor（Keyset）游标寻址原理

Cursor 分页不再依赖全局物理行偏移，而是依赖上一页最后一条记录的有序唯一键（如时间戳与主键 ID）。

### 1. 状态机与查询形态

在倒序排序中，游标查询将分页条件直接转化为索引范围扫描：

```sql
SELECT id, ts, title
FROM feed
WHERE ts < :last_seen_ts
ORDER BY ts DESC
LIMIT 5;
```

由于数据库利用 B-Tree 索引对 `ts` 进行了有序存储，查询引擎执行一次 \( O(\log N) \) 的树查找，直接定位到小于 `:last_seen_ts` 的第一条记录，并顺序读取 5 条数据。无论翻到多深，查询性能始终保持恒定。

同时，即使系统在列表头部插入了成千上万条新数据，由于游标条件固定为 `ts < :last_seen_ts`，新插入的数据时间戳较大，天然被过滤在外，绝对不会导致已有数据向下漂移而重复返回。

### 2. 方案全方位维度对比

| 评估维度 | OFFSET 分页 | Cursor 游标分页 |
| --- | --- | --- |
| 跨页数据一致性 | 差（并发写入重行，删除漏行） | 强（不重不漏，严格差 1 衔接） |
| 深分页查询复杂度 | \( O(N) \)，延迟随深度线性暴增 | \( O(\log N) \)，常数级毫秒响应 |
| 跳页支持 | 支持任意跳转（如跳至第 10 页） | 不支持任意跳页，仅支持连续翻页 |
| 索引依赖 | 基础索引，易触发回表 | 必须建立复合排序列覆盖索引 |
| 游标保密性 | 无要求 | 需将游标序列化为防篡改 Token |

## 三、生产级实现的关键工程考量

落地 Cursor 游标分页时，必须解决时间戳冲突与游标安全问题。

### 1. 唯一性决胜列（Tie-Breaker）设计

真实业务中，高并发写入极易产生相同毫秒的时间戳。如果仅根据 `ts < :last_ts` 过滤，具有完全相同时间戳的同批数据会在换页时被整体丢弃。

解决方案是引入严格单调的唯一列（如自增主键 `id`）作为决胜键，并建立联合索引：

```sql
CREATE INDEX idx_feed_ts_id ON feed(ts DESC, id DESC);
```

在支持行值比较的数据库（如 PostgreSQL、SQLite 3.15+）中，查询语句写作：

```sql
SELECT * FROM feed
WHERE (ts, id) < (:last_ts, :last_id)
ORDER BY ts DESC, id DESC
LIMIT 5;
```

在 MySQL 等数据库中，若优化器未能有效利用行值比较，可展开为等价的析取范式：

```sql
SELECT * FROM feed
WHERE ts < :last_ts OR (ts = :last_ts AND id < :last_id)
ORDER BY ts DESC, id DESC
LIMIT 5;
```

### 2. 不透明游标（Opaque Token）封装

不能直接将内部数据库字段（如自增 ID、时间戳）暴露在公开 API 中，否则会暴露内部系统时钟与业务规模，并导致客户端与底层表结构强耦合。
最佳实践是将游标信息序列化为 Base64 编码的不透明字符串：

```ts
interface CursorPayload {
	ts: number;
	id: number;
}

function encodeCursor(payload: CursorPayload): string {
	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(token: string): CursorPayload {
	const raw = Buffer.from(token, "base64url").toString("utf-8");
	return JSON.parse(raw);
}
```

客户端在后续请求中只需原样回传 `?cursor=eyJ0cyI6MTcy...`，服务端解码后还原为 SQL 过滤条件。

### 3. 删除空洞（Tombstone Holes）的处理

如果上一页末尾记录或者中间的某条记录在翻页过程中被删除，游标分页的行为表现为平滑跳过（`c3 = [9, 8, 7, 6, 5]`）。
它不会报错中断，也不会导致数据重复。空洞是数据删除的自然体现，业务客户端直接呈现剩余记录即可。

## 四、验证实验与数据闭环

本机制在 `experiments/cursor-pagination/pages.py` 中通过标准库 SQLite 验证：
- 断言 O1：OFFSET 在并发写入 2 行新数据后，第一页末尾与第二页开头重叠 `[16, 17]`，重叠率达到 40%。
- 断言 O2：Cursor 游标在相同并发写入场景下，集合交集严格为空，实现 0 重行。
- 断言 O3：Cursor 翻页连续性严格成立，第一页末位（18）与第二页首位（17）差 1 衔接。
- 断言 O4：物理删除记录（10, 11）后，游标平滑越过空洞，无异常中断。

## 参考资料

- Markus Winand: "Use the Index, Luke! - Paging Through Results" (<https://use-the-index-luke.com/sql/partial-results/fetch-next-page>)
- GitHub REST API 分页设计规范：<https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api>
- Slack 开发者规范：Evolving API Pagination (<https://slack.engineering/evolving-api-pagination-at-slack/>)
- 站内对照：API 契约与幂等键设计，`/writing/service-api-shape`
- 架构关联：支付回调系统中的对账分页实战，`/writing/service-payment-callback-design`
