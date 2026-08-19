---
title: "Redis 集合三种编码：从 intset 到 hashtable 的内存跳跃实测"
description: "本机实测 Redis 7：512 整数集合是 intset(1328B) 加一个整数变成 hashtable(24712B)，内存 18.6x；混合小元素集合用 listpack 而非 hashtable。阈值、升级条件与工程代价。"
publishedAt: "2026-08-19"
tags: ["Redis", "数据库", "源码考古"]
draft: false
featured: false
---

**TL;DR：** Redis 内建发布集合有三档"自动变速箱"：**intset**（纯整数、元素 ≤ `set-max-intset-entries`=512）与 **listpack**（Redis 7 的小集合编码）是紧凑的连续内存布局；**hashtable** 是通用哈希表。本机实测（redis:7-alpine 默认配置）——`SADD` 512 个整数集合 `MEMORY USAGE`=1328B，**再加第 513 个整数瞬间升级为 hashtable，变成 24712B，内存暴涨 18.6 倍**；混合了字符串的小集合（10 整数+1 字符串）用 listpack 仅 88B,而 129 个元素(含字符串)直接落 hashtable(6280B)。工程结论：集合元素数逼近阈值时，单次写入会触发一次重建+内存跳变；元素全为整数且确定超过 512 的场景,应主动预判升级成本,而不是观察线上`MEMORY USAGE`突然翻倍才回头查代码。

## 一、三档编码矩阵:什么时候用哪一档

Redis 7 里集合对象有且只有三种编码:

| 编码 | 适用条件 | 内存布局 | 查询复杂度 |
| :--- | :--- | :--- | :--- |
| `intset` | 元素全部是 64 位有符号整数, 且数量 ≤ 512 | 有序连续数组, 按值域自动选 16/32/64 位宽度 | O(log n) |
| `listpack` | 元素 ≤128 条, 每条 ≤64B(小混合集) | 紧凑连续内存条目 | O(n) |
| `hashtable` | 上述条件不满足时 | 哈希表(桶+链) | O(1) 均摊 |

intset 是**自适应宽度**的:1..512 这类小整数用 int16(每元素 2B),写入超过 32767 的值自动整体升级为 int32/int64 编码(实测:512 个含 2^32 的整数仍是 intset,但从 1328B 变 5168B——宽度升级,不是 hashtable)。升级是**单向不可逆**的:一旦添加元素不满足当前编码条件(超 512 整数 / 超 128 混合 / 出现非整数),旧编码整体重建为新编码;删除元素套不上"降级"规则。

## 二、实测:一个整数触发的内存跳跃

默认配置 `set-max-intset-entries`=512、`set-max-listpack-entries`=128。逐步 `SADD` 整数:

```
512 个整数  → intset    MEMORY USAGE = 1328   (约 2.6B/元素)
+ 第 513 个 → hashtable MEMORY USAGE = 24712  (约 48B/元素)  ← 18.6x
```

对比:`SADD` 3 个整数 72B;10 整数+1 字符串用 listpack 88B;128 整数+1 字符串(129 条>)直接 hashtable 6280B。**阈值是硬边界**——卡在 512 整数内,每元素内存约 2.6B;多一个就跳到 48B。

为什么差这么多:intset 是**连续数组**,512 个小整数按 int16 宽度(每元素 2B)只占 1KB 出头;hashtable 要为每个元素准备 dictEntry(24B)+ 指针 + bucket 数组——整体重建且空间占位按规模分配。实测中间态:同样 512 个整数,若值域超过 int32(写入 2^32),intset 升级为 int64 宽度,内存从 1328B 变 5168B——这是 intset 内部的宽度升级,仍是 intset,还没到 hashtable 的 24712B。

运行环境:redis:7-alpine,默认配置。命令证据全记录在 `experiments/redis-intset-encoding-memory/`。

## 三、工程启示:什么场景会被这一跳打脸

三类场景最容易踩中:

1. **集合作为去重计数器**——标签、设备ID、词汇表,量级从小爬到大。前 500 个元素内存友好,第 513 个元素写入瞬间内存翻 18 倍;如果这个集合又频繁被 `SISMEMBER`/`SADD` 访问,重建是 O(n) 成本。
2. **混合元素的集合**——例如 `SADD set user:{id}`(字符串)。时空字符串集合会被 listpack 管理,但超过 128 条(或单元素超 `set-max-listpack-value`)后重建;字符串场景的 128 阈值来得比 512 更快。
3. **批量导入**——`SUNIONSTORE`/`SINTERSTORE` 目标集合临时溢出阈值。

应对:

- 你是**偏只读的静态集合**(如黑名单),用 `SET` 阈值配置或提前 `OBJECT ENCODING` 检查,避免运行时抖动;
- 你是**高频读写集合**,元素很容易上几千:与其纠结 intset/listpack,不如明确"反正会变 hashtable",读路径的 O(1) 才是收益;内存预算按 hashtable 档预留,别按 intset 档乐观估;
- Redis 6+ 的 `CONFIG SET set-max-intset-entries` 是全局项,影响所有小集合,别为一个集合盲目调大——它会让所有集合的内存预算上升。

## 四、结论：集合编码是"小集合保险"，别把预算按最便宜档估

集合编码是 Redis 给"大多数集合都小"的现实买的保险:intset/listpack 把常见小集合压到个位数 B/元素,代价是超阈值的整档重建。它不会让业务崩溃,但会在**无痕的一瞬间**把内存账单抬到 18 倍。工程上没有魔法:要么控制集合规模(用小集合/分割),要么默认按 hashtable 预算内存——把"阈值跳变"当成 Redis 集合的一等公民,写代码时就想清楚元素规模上限,而不是等监控告警。

下一步可执行:`OBJECT ENCODING <key>` + `MEMORY USAGE <key>` 扫一遍生产里所有大集合,看有没有卡在阈值附近的;对会增长的集合,提前按 hashtable 档给内存配额。