---
title: "SQLite 索引两形态：FTS5 全文 vs JSON 生成列"
description: "同一 SQLite 数据库中的两种高性能检索形态。拆解 FTS5 中文分词陷阱与 trigram 倒排索引，对比 JSON1 生成列（STORED 与 VIRTUAL）建索引走 SEARCH 路径及两个经典暗坑。"
publishedAt: "2026-09-20"
tags: ["数据库", "SQLite", "索引", "全文检索", "JSON"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 在轻量级嵌入式存储与边缘计算中，让 SQLite 查得快有两个正交方案。全文长文本检索应当采用 FTS5 虚拟表外联内容表，默认分词器按空格切词导致中文匹配命中为 0，切换为 `tokenize='trigram'` 后可达到与 `LIKE` 相同的 29 行召回率且支持 BM25 相关度排序。针对半结构化文档的精准字段查询，应当采用 JSON1 生成列（`GENERATED ALWAYS AS`）挂载常规 B-Tree 索引，将全表 `SCAN` 转变为常数级的 `SEARCH ... USING INDEX`。本文结合仓库内经过验证的 8 项自动化断言，详解两类索引机制、数据流转拓扑与生产陷阱。

## 一、方案对比：查“词”与查“字段”的物理分流

在单个业务表中，混合存储非结构化长文本与半结构化 JSON 是常见形态：

```text
SQLite 两种索引形态的物理拓扑：
                  +----------------------------------------------+
                  |               业务原始表 (orders)             |
                  | id (PK) | body (JSON) | title (长文本)       |
                  +----------------------------------------------+
                                  /              \
                                 /                \
        [字段级精准过滤]        /                  \   [非结构化全文检索]
                              v                    v
      +---------------------------------+  +---------------------------------+
      | JSON 生成列 + B-Tree 索引       |  | FTS5 虚拟表 (External Content)  |
      | - VIRTUAL: 读时动态提取         |  | - 倒排索引 (Inverted Index)     |
      | - STORED: 写入时持久化物理列    |  | - 分词器: trigram 3-gram 切分   |
      | - 计划: SEARCH ... USING INDEX  |  | - 算法: BM25 相关度评分         |
      +---------------------------------+  +---------------------------------+
```

| 维度 | FTS5 全文虚拟表 | JSON 生成列索引 |
| --- | --- | --- |
| 核心目标 | 模糊词项检索、长文本匹配、相关性打分 | 精确提取 JSON 内部 Key 进行等值或范围查找 |
| 底层数据结构 | 倒排索引（Inverted Index / DocList） | 标准 B+Tree 索引 |
| 存储代价 | 双写倒排表，体积膨胀显著 | STORED 占物理磁盘，VIRTUAL 仅占索引树空间 |
| 查询语法 | `MATCH '退款流程'` | `WHERE sku = 'SKU-7'` |
| 跨列组合 | 支持 BM25、高亮函数（highlight）、词距 | 支持与复合主键、多条件字段自由组合 |

## 二、形态一：FTS5 中文分词与 trigram 倒排索引

FTS5 采用虚拟表（Virtual Table）机制运作。当使用外部内容表（External Content Table）时，FTS5 仅构建和维护词条索引，数据源引用实体表以节省空间。

```sql
-- 1. 创建业务主表
CREATE TABLE docs(
  id INTEGER PRIMARY KEY,
  body TEXT
);

-- 2. 创建绑定主表的 FTS5 虚拟表 (默认分词器)
CREATE VIRTUAL TABLE docs_fts USING fts5(
  body,
  content='docs',
  content_rowid='id'
);

-- 3. 创建启用 trigram 分词的 FTS5 表
CREATE VIRTUAL TABLE docs_tri USING fts5(
  body,
  content='docs',
  content_rowid='id',
  tokenize='trigram'
);
```

### 1. 默认分词器中文失灵根因

SQLite FTS5 默认使用 `unicode61` 分词器。该分词器依赖 Unicode 标点符号与空白字符作为切词边界。在处理西方拉丁语系时，它能通过词根截断很好地工作；但遇到没有空格分隔的中文文本时，`unicode61` 会将整句或整段中文作为一个不可分割的超长 Token。

在实测（`experiments/sqlite-fts/fts.py`）中，200 条包含“订单退款流程说明”的记录：
- `docs_fts MATCH '退款流程'` 返回 **0 行**。这并非 SQLite 的 Bug，而是分词器未能产生对应的词条索引。
- 英文前缀查询 `docs_fts MATCH 'refun*'` 能精确召回 **29 行**。

### 2. trigram 分词器原理与 BM25 排序

通过在建表时指定 `tokenize='trigram'`，FTS5 会将文本切分为连续的 3 字符重叠窗口（3-gram）。由于中文每个单字本身构成独立字符，任何长度大于等于 3 个汉字的词条都能在 trigram 倒排索引中被精准命中。

```python
# 验证 trigram 召回率与 LIKE 等价性
like_set = {r[0] for r in con.execute("SELECT id FROM docs WHERE body LIKE '%退款流程%'")}
tri_set = {r[0] for r in con.execute("SELECT rowid FROM docs_tri WHERE docs_tri MATCH '退款流程'")}

# 断言：两者召回集完全一致 (29 行)
assert like_set == tri_set and len(tri_set) == 29

# 支持 BM25 相关性排序
ranked = con.execute("""
    SELECT rowid, bm25(docs_tri)
    FROM docs_tri
    WHERE docs_tri MATCH '退款流程'
    ORDER BY bm25(docs_tri)
""").fetchall()
```

注意边界限制：trigram 索引要求检索词项必须达到 3 个 Token。若仅输入 2 个汉字（如“退款”），trigram 同样无法命中，必须退回 `LIKE` 兜底。

## 三、形态二：JSON1 生成列与执行计划优化

在移动端或边缘网关中，日志和订单常常以 JSON 字符串形式持久化。若每次查询都调用 `json_extract(body, '$.sku')`，SQLite 只能执行全表扫描（`SCAN TABLE`），在数据量增长后发生严重 CPU 颠簸。

```text
未加索引全表扫描 vs 生成列走 B-Tree 索引对比：
[未建索引] SELECT * FROM orders WHERE json_extract(body, '$.sku') = 'SKU-7'
           └── SCAN orders (逐行反序列化 JSON，5000 行耗时巨大)

[建索引后] SELECT * FROM orders WHERE sku = 'SKU-7'
           └── SEARCH orders USING INDEX idx_sku (sku=?) (常数级 B-Tree 定位)
```

### 1. STORED 与 VIRTUAL 生成列的物理差异

```sql
-- 模式 A: STORED 列 (写入时计算并落盘，增加磁盘占用，读取时不消耗 CPU)
CREATE TABLE orders(
  id INTEGER PRIMARY KEY,
  body TEXT,
  sku TEXT GENERATED ALWAYS AS (json_extract(body, '$.sku')) STORED
);
CREATE INDEX idx_sku ON orders(sku);

-- 模式 B: VIRTUAL 列 (写入不落盘，读取时动态求值，通过 B-Tree 索引加速定位)
ALTER TABLE orders ADD COLUMN qty_v INTEGER
  GENERATED ALWAYS AS (CAST(json_extract(body, '$.qty') AS INTEGER)) VIRTUAL;
CREATE INDEX idx_qty ON orders(qty_v);
```

1. **STORED 列**：物理写入磁盘。优势是查询读取字段时无需反序列化 JSON；缺点是增加数据库文件体积，且**无法通过 ALTER TABLE 语句追加**。
2. **VIRTUAL 列**：磁盘上不占用空间，每次读取时在内存中动态提取。优势是支持在线通过 `ALTER TABLE ADD COLUMN` 动态添加，并且为 VIRTUAL 列创建的 B-Tree 索引依然能让查询执行计划走 `SEARCH`。

## 四、生产实测两个经典暗坑

在 `experiments/sqlite-json-index/jsonidx.py` 的自动化验证中，我们捕获了两个隐蔽的引擎行为：

### 1. ALTER TABLE 拒绝追加 STORED 列

若尝试对现有表执行：
```sql
ALTER TABLE orders ADD COLUMN sku TEXT GENERATED ALWAYS AS (json_extract(body, '$.sku')) STORED;
```
SQLite 将直接报错返回：`cannot add a STORED column`。这是因为向现有表物理插入一列需要重写底层整个 B-Tree 页面的行记录格式（Record Format）。因此，凡是在运维期动态优化的索引，必须声明为 `VIRTUAL`，或者通过新建临时表复制数据迁移。

### 2. 预编译语句缓存掩盖执行计划变更

在对同一数据库连接执行删除索引实验时：
```python
# 1. 删除索引
con.execute("DROP INDEX idx_sku")

# 2. 若直接复用完全相同的 SQL 文本查询执行计划
plan = con.execute("EXPLAIN QUERY PLAN SELECT * FROM orders WHERE sku = 'SKU-7'").fetchall()
```
由于 SQLite 内部维护了已编译好的 VDBE 字节码语句缓存（Prepared Statement Cache），引擎会直接复用该语句此前的执行计划，返回仍然引用已删除索引的旧计划。只有微调 SQL 文本（例如追加一个恒真条件 `AND id >= 0`）或关闭连接重建，才能观察到真实退化后的全表扫描计划。在自动化基准测试与监控探针中必须防范此缓存效应。

## 五、经典故障与选型决策矩阵

| 场景需求 | 推荐方案 | 物理实现 | 故障风险与预防策略 |
| --- | --- | --- | --- |
| 订单编号、SKU 精确查找 | JSON 生成列 + B-Tree | `VIRTUAL/STORED` + `INDEX` | 避免对大 JSON 中的嵌套深层字段滥用 `STORED`，防止库文件膨胀 |
| 日志明细中文关键字搜寻 | FTS5 虚拟表 | `tokenize='trigram'` + content 表 | 查询词少于 3 个汉字时无法匹配，需在应用层做长度兜底分支 |
| 英文技术文档检索 | FTS5 虚拟表 | 默认 `unicode61` + 前缀匹配 `*` | 严禁直接使用默认分词器处理中日韩多语言混合数据 |
| 动态配置项范围过滤 | JSON VIRTUAL 生成列 | `CAST(json_extract(...) AS INTEGER)` | 提取数值必须显式 `CAST`，否则按字符串词典序比较造成逻辑错误 |

## 六、证据卡与实测指标

| 验证模块 | 脚本路径与证据输出 | 断言项 | 实测结果 |
| --- | --- | --- | --- |
| FTS5 分词器 | `experiments/sqlite-fts/fts.py` | T0 默认切词、T1 trigram 召回、T2 BM25 打分、T3 前缀 | 4 项断言全部 PASS，200 条文档精准召回 29 条 |
| JSON 生成列 | `experiments/sqlite-json-index/jsonidx.py` | J1 索引命中、J2 数量正确、J3 删索引退化、J4 ALTER VIRTUAL | 4 项断言全部 PASS，5000 行数据单 Key 过滤精准命中 |

## 参考资料

- SQLite 官方文档：FTS5 Extension (<https://www.sqlite.org/fts5.html>)
- SQLite 官方文档：Generated Columns (<https://www.sqlite.org/gencol.html>)
- SQLite 官方文档：JSON1 Functions and Operators (<https://www.sqlite.org/json1.html>)
- 源码证据：`experiments/sqlite-fts/` 与 `experiments/sqlite-json-index/`
