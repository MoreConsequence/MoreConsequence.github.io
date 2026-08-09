---
title: "Go map 的账本：8192 倍数据只涨 1.3 倍，和 10 万次插入的 28% 税"
description: "map 查找成本与规模几乎无关：65536 项 vs 8 项都是约 10ns（8192 倍数据涨 1.3 倍），miss 反而比 hit 快（6.9 vs 10.0ns）。本机实测 Go 1.25.1：hmap 的 8 槽 bucket + tophash 先筛 + fast key 直走，解释全部曲线；插入 10 万项不预分配比预分配慢 28%、多花 38% 内存（扩容增量迁移的税）；slice 线性查找在 n≤64 时更便宜（4.7 vs 7.6ns），n 越大差距越悬殊（720 vs 10ns）。"
publishedAt: "2026-08-13"
updatedAt: "2026-08-13"
tags: ["Go", "数据结构", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** Go map 是哈希表：8 槽 bucket + tophash 首字节筛子 + 溢出链 + 负载因子 6.5 翻倍扩容 + 增量迁移。查找实测与规模无关（8 项 7.6ns，65536 项 10.0ns），三个反直觉结论：① miss 比 hit 快（6.9 vs 10.0ns，miss 不比较 key 内容）；② slice 线性查找在 n≤64 时更便宜（4.7 vs 7.6ns），超过 64 项差距指数拉大（720 vs 10ns）；③ 不预分配插入 10 万项比预分配慢 28%、多花 38% 内存（扩容的迁移税）。写代码时：能预估规模就 `make(map, n)`，小数据集合优先 slice。

## 一、hmap 解剖：8 槽 bucket、tophash、溢出链

Go 1.25 默认的 map 实现是经典哈希表（`runtime/map_noswiss.go`，Swiss table 仍在 `GOEXPERIMENT=swissmap` 实验状态）。核心结构：

```go
type hmap struct {
	count     int    // 元素数
	B         uint8  // bucket 数量的 log2（2^B 个 bucket）
	hash0     uint32 // 随机哈希种子（每次创建 map 都不同）
	buckets    unsafe.Pointer // 2^B 个 bucket
	oldbuckets unsafe.Pointer // 扩容时的旧桶数组（平时为 nil）
	nevacuate  uintptr        // 扩容迁移进度指针
}

type bmap struct {
	tophash [8]uint8 // 每个 key 哈希的高 8 位
	// 后面跟着 8 个 key、8 个 elem、1 个 overflow 指针
}
```

三个设计决策决定性能画像：

1. **每个 bucket 8 个槽**：哈希值的前 8 位（tophash）先当筛子——先比对 tophash，全不同直接跳过，省掉 key 比较；同 tophash 才需要完整比较 key。
2. **哈希种子 hash0 随机**：每次建 map 种子不同，攻击者无法构造哈希碰撞队列（防 HashDoS）。代价是同一个 key 在不同 map 里哈希不同——所以遍历顺序随机是设计承诺，不是 bug。
3. **负载因子 13/16 ≈ 6.5**：桶均元素超过 6.5 就翻倍扩容。6.5 是"查找快（桶不深）"和"内存省（桶不满）"的折中点。

## 二、查找为什么 O(1)：tophash 筛子 + fast key 通道

实测（Go 1.25.1，8 核）命中查找：

| map 规模 | 查找耗时 | 对比 |
|---|---|---|
| 8 项 | 7.6ns | 基线 |
| 64 项 | 8.3ns | ×1.1 |
| 1024 项 | 10.0ns | ×1.3 |
| **65536 项** | **10.0ns** | **×1.3（8192 倍数据）** |

**8192 倍的数据量，耗时只涨 30%**——这就是哈希表的均摊 O(1)：哈希定位桶是常数时间，桶内 8 槽线性但深度恒定（负载因子锁死）。对比同场景的线性查找（见第四节），这是数量级差异。

三个细节值得知道：

- **miss 比 hit 快**（6.9 vs 10.0ns）：命中要完整比较 key 内容确认相等，miss 只需发现 tophash 全不匹配就返回——miss 是哈希表的最优路径，别为"查不到"担心。
- **int key 比 string key 快**（6.3 vs 10.0ns）：运行时对 `map[int]` 和 `map[string]` 有专门的 fast path（map_fast64/map_faststr），跳过通用 memhash 的间接调用。上一篇文章《[string ↔ []byte](/writing/go-string-byte-conversion)》里 `m[string(b)]` 的 0 allocs（7.7ns）也是 faststr 的产物——同一条优化通道。
- **8 字节小 struct 不慢**（6.0ns）：哈希成本由字节数决定，小 key 的差异在 key 比较，量级一致。

## 三、写路径：负载因子、翻倍扩容、增量迁移

插入 10 万字符串 key（实测）：

| 方式 | 耗时 | 内存 |
|---|---|---|
| `var m map[string]int`（零预分配） | 17.1ms | 9.3MB |
| `make(map[string]int, 100000)` | **12.2ms（-28%）** | **5.8MB（-38%）** |

28% 的耗时税和 38% 的内存税来自扩容：负载因子 6.5，10 万项需要 `2^B×6.5 ≥ 100000` → B=14（16384 桶）。零预分配从 B=0 起步，每超过 6.5×2^B 就翻倍——全程约 14 轮扩容，累计迁移的旧桶数组按几何级数叠加（约等于最终桶数的 2 倍），溢出桶和中间代桶全是净开销。预分配让桶数组一步到位，一次迁移都没有。

但扩容的"瞬间卡顿"并不存在，这是 Go 的另一个设计：**增量迁移**。触发扩容时（`hashGrow`）只新建桶数组并记录 `oldbuckets`，之后每次插入/删除顺路迁移两个桶（`growWork`：当前桶 + `nevacuate` 进度桶），全部迁完才释放旧数组。代价是扩容期间查找要同时查新旧两处，换来无毛刺的写路径——大数据量批量插入时尤其明显。

删除是 O(1)（实测 8.0ns）：只清槽位不缩容——**map 删除后内存不回落**（bucket 数组不收缩），长生命周期 map 的删除堆积会让内存膨胀，这是 map 作为缓存的一个真实限制。

## 四、拐点实验：小数据集合 slice 更便宜

同一个"按 string 找 int"场景，slice 线性查找 vs map（查找目标固定在末尾，最坏情况）：

| 规模 | slice 线性 | map | 谁赢 |
|---|---|---|---|
| 8 项 | 4.7ns | 7.6ns | slice（×0.6） |
| 64 项 | 32.3ns | 8.3ns | map（×0.26） |
| 1024 项 | 719.8ns | 10.0ns | map（×0.014） |

拐点在 n≈16~64 之间。原因：map 的每次查找固定成本（哈希 + 跳指针 + tophash 循环）约 7ns 起步，slice 的循环体 ~0.5ns/次。**元素少时固定成本输给循环，元素多时 map 的常数时间碾压线性**。结论：10 个以内的查找场景用 slice（还能保序），超过 64 项无脑换 map。遍历同理：map 遍历 65536 项 531µs（8.1ns/项），且顺序随机——需要稳定顺序的场合 map 之后要排序，这时 slice 常常整体更划算。

## 五、生产判断：map 的账怎么付划算

| 场景 | 选择 | 依据 |
|---|---|---|
| 小集合（≤64 项） | slice 线性查找 | 4.7ns vs 7.6ns，map 固定成本不划算 |
| 大集合、按 key 查 | map | 8192 倍数据只涨 1.3 倍 |
| 规模可预估 | `make(map, n)` 预分配 | 10 万项省 28% 时间、38% 内存 |
| key 是 int/string | 直接用 | fast path，别包成 struct |
| 长生命周期缓存 | 警惕删除不缩容 | 内存只涨不落，考虑重建或换 LRU |
| 需要有序遍历 | slice + sort 或排序结构 | map 遍历随机 + 排序税 |

最容易被忽视的一条：**make(map, n) 的 n 是数量级承诺，不是精确值**——写 `make(map[string]int, 0)` 等于没预分配。批量载入数据前先算一次规模（或干脆 `make(map[string]int, 粗估)`），扩容税直接消失。

## 结论

Go map 的账本由三个常数锁定：8 槽 bucket、6.5 负载因子、fast key 通道——它们共同让查找成为与规模无关的 ~10ns 常数，也让 miss 比 hit 便宜、int key 比 string key 便宜。写路径上的大额开销是扩容迁移税：预分配免掉它（-28% 时间、-38% 内存），增量迁移保证过程中无毛刺。选型拐点清晰：64 项以内 slice 赢，之上 map 赢；遍历顺序随机 + 删除不缩容是它的两个结构性限制，记账时别忘。

下一步可做的事：把代码里 `make(map[X]Y)` 的调用点扫一遍，容量为 0 的补上数量级；小集合的 map 换成 slice 验证拐点。

## 参考资料

1. Go 源码 `runtime/map_noswiss.go`（hmap、bmap、hashGrow/growWork/evacuate）—— Go 1.25.1 本机源码
2. Go 官方文档《Maps》—— https://go.dev/blog/maps
3. 前作：[string ↔ []byte：零拷贝的边界](/writing/go-string-byte-conversion)、[Go 锁成本](/writing/go-lock-cost-futex-rwlock)