---
title: "sync.Pool 的错位设计：命中 8ns、GC 后重建 149ns、256B 的分界线"
description: "sync.Pool 是 GC 的配件不是缓存：per-P 私有无锁命中实测 8.3ns（vs 直接分配 256B 的 87.7ns，10 倍），但每次 GC 都会清空当前代——池与 GC 频率耦合，分配率越高池被清得越勤，GC 后首个 Get 要重建（实测 149ns）。victim cache 让它多活一代（实测 GC 后仍能命中）。结论：≥256B 大对象用池（10 倍差），小对象别用（tiny 分配 12.6ns 已够便宜）。本机实测 Go 1.25.1。"
publishedAt: "2026-08-15"
updatedAt: "2026-08-15"
tags: ["Go", "并发", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** sync.Pool 的正确心智模型是"**GC 的减压阀**"，不是"通用缓存"：per-P 私有无锁路径命中实测 8.3ns（256B 对象 vs 直接分配 87.7ns，10 倍差）；但每次 GC 会把当前代清空（poolCleanup），对象只经 **victim cache** 多活一代（GC 后 Get 实测仍能命中，124.6ns 含 GC 本身）；GC 后首个 Get 触发重建（实测 148.9ns）。三个推论：① 池与 GC 频率耦合——分配率越高 GC 越频繁、池被清得越勤，恶性循环时池失效；② 小对象（≤256B）用池不如直接分配（tiny allocator 12.6ns 已够便宜）；③ 池的正确用法是"降级到重建也不心疼"的对象。

## 一、设计：per-P 私有化 + victim 两代回收

sync.Pool 的核心是 `poolLocal`（每 P 一份，sync/pool.go）：

```go
type poolLocal struct {
	poolLocalInternal // private any + shared poolChain
	pad [128 - ...]byte // 防 false sharing
}
```

两个机制构成它的全部行为：

1. **每 P 一份私有槽**：Get 先取本 P 的 `private`（无锁）；没有则从本 P 的 `shared` 队列（无锁 pop）；还没有才去别的 P 偷（有锁），最后才轮 victim 和 New。**热点在私有槽上，锁只在偷取路径出现**——这就是 8.3ns 的来源。
2. **victim 两代回收**：GC 时（poolCleanup）不直接清空，而是把当前代整体降级为 `victim`（pool.go:57），下一轮 GC 才真正清掉 victim。**对象至少活两代 GC**，给"GC 后仍需 Get"的场景留了缓冲——实测 GC 后 Get 仍能命中（124.6ns，其中大头是 GC 本身）。

## 二、实测：10 倍差距与 GC 耦合

本机实测（Go 1.25.1，arm64 8 核，256B 对象）：

| 场景 | ns/op | 说明 |
|---|---|---|
| 池 Get+Put（单线程） | **8.3** | 私有槽无锁路径 |
| 池 Get+Put（2 线程分 P） | 4.2 | 各自私有，无干扰 |
| 直接分配 256B | **87.7** | 对照（mallocgc 路径） |
| 每 1000 次操作一次 GC 的池 | 148.9 | GC 清池后 New 重建的代价 |
| GC 后 Get（victim） | 124.6 | 命中 victim，含 GC 本身 |

读法：

1. **10 倍差是池存在的理由**：256B 对象的分配是 87.7ns（呼应《[mallocgc 解剖](/writing/go-mallocgc-allocator)》的 89ns，数字闭合），池把热路径压到 8.3ns。
2. **GC 是池的敌人也是池的语义**：每次 GC 清空当前代。你的程序分配率越高 → GC 越频繁 → 池被清得越勤 → 重建越多。**池的收益与 GC 压力负相关，而 GC 压力又由池里的对象总量贡献**——用池必须同时压低分配率，否则池名存实亡。
3. **victim 是缓冲不是保险**：只多活一代（两次 GC 之间）。高频 GC 下 victim 形同虚设。

## 三、什么时候该用池：256B 分界线

| 对象大小 | 直接分配 | 池 | 判断 |
|---|---|---|---|
| ≤16B（tiny 合并） | 12.6ns | 8.3ns+（且池自身有结构） | **别用池**，tiny 已够便宜 |
| 256B | 87.7ns | 8.3ns | 用池，10 倍差 |
| 4KB+ | 494ns | ~8ns（复用） | 用池，60 倍差 |
| 生命周期长（缓存/连接） | — | — | 别用池，用长期持有 |

分界线在 256B 附近：池的 8.3ns 与 tiny 分配（12.6ns）同量级，池的多层结构（poolLocal 数组 + victim 指针 + GC 耦合）不值得为 4ns 买单；对象越大池的优势越陡。**池只应该装"重建贵且生命周期短"的大对象**——连接、大 buffer、解析器中间结构。

## 四、反模式：把池当缓存

最常见的误用：把"想缓存的东西"塞进 sync.Pool，期望它留到下次用。池的三条纪律与此相悖：

1. **GC 会清池**：缓存期望持久，池承诺只活两代 GC——缓存用池等于"定时全清"；
2. **Get 可能返回 nil/新对象**：代码必须处理"没拿到"——这意味着池不是可靠的缓存语义；
3. **Put 的对象不能假设会被复用**：只是"可能"。

要持久缓存，自己持有对象（map + 锁，或分片）；要降低 GC 压力，用池装临时大对象。**池解决的是"频繁创建销毁"不是"需要记住"**——这是它与缓存最根本的语义差。

## 结论

sync.Pool 是"GC 的减压阀"：per-P 私有槽给出 8.3ns 的无锁命中，victim 让对象多活一代，代价是池与 GC 频率耦合、GC 后重建要付 149ns。使用边界清晰：256B 以上的短命大对象用池（10~60 倍差），小对象交给 tiny allocator（12.6ns），要持久缓存的别用池。判断池是否有效的终极指标只有一个：**线上 GC 频率有没有下降**——池省下的分配要足以让 GC 周期拉长，否则它只是把对象藏起来给 GC 看。

下一步可做的事：把你代码里的 sync.Pool 过一遍，GC 频率对比（`GODEBUG=gctrace=1`）；凡池里装小对象或依赖池做缓存的，改直接分配或长期持有。

## 参考资料

1. Go 源码 `sync/pool.go`（poolLocal、victim、poolCleanup）、`runtime/syncpool.go` —— Go 1.25.1 本机源码
2. Go 官方文档《sync.Pool 的语义》—— https://pkg.go.dev/sync#Pool
3. 前作：[mallocgc 解剖](/writing/go-mallocgc-allocator)、[Go GC 时间账本](/writing/go-gc-gctrace-account)