---
title: "sync.Map 的真实边界：read 表便宜，写入与 miss 会把账单转回来"
description: "一次本机 Go 1.25.1/arm64 基线显示：8 个稳定 key 的并发读中 sync.Map 为 1.485ns，RWMutex+map 为 95.62ns；同样的已存在 key 并发写则是 168.0ns 对 108.9ns，且 sync.Map 有 48B/次分配。文章从 read/dirty 双表、miss 提升和 Range 语义解释：sync.Map 不是通用并发 map，而是特定工作负载的优化。"
publishedAt: "2026-08-15"
updatedAt: "2026-08-16"
tags: ["Go", "并发", "性能"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** `sync.Map` 的价值不在“并发”三个字，而在特定的读路径。本机统一基准（Go 1.25.1、Darwin arm64、`-cpu=8`）中，8 个稳定 key 并发读取：`sync.Map` **1.485ns/op、0 allocs**，带 `RWMutex` 的普通 map **95.62ns/op、0 allocs**；但对同一组已存在 key 并发写入时，`sync.Map` 是 **168.0ns/op、48B/1 alloc**，普通 map 是 **108.9ns/op、0 allocs**。`Load` 命中 read 表只做原子指针读取；miss、新 key 和部分写入会进入锁保护的 dirty 路径。结论不是“永远用 sync.Map”，而是先证明 key 集合、读写比例和一致性要求符合它的设计。


---

![Go sync.Map 底层双表架构：read 只读无锁表 vs dirty 加锁脏表与 misses 计数提升](../../../public/images/go-sync-map-read-dirty-amended-misses.svg)

## 一、直觉错在哪里：以为 sync.Map 是「并发版的 map」

最常见的直觉：`sync.Map` 是高并发场景下的 map 升级版，比 Mutex+map 快。这个直觉在写密集场景直接失效——上表已经证明。真正成立的条件藏在它名字里：它是为 **read-mostly**（读多写少）工作负载设计的。

为什么？看源码结构（`$GOROOT/src/sync/map.go`）：sync.Map 内部持有**两张表**——read map 和 dirty map。read 表里的每个 entry 的指针是 `atomic.Pointer[any]`（第 91-94 行的字段注释：`If p == nil, the entry has been deleted`；`expunged` 标记已删条目）。`Load` 的完整路径（第 127-134 行）：

```go
func (m *Map) Load(key any) (value any, ok bool) {
	read := m.loadReadOnly()
	e, ok := read.m[key]
	if !ok && read.amended {
		m.mu.Lock()
		// ... 慢路径：拿锁查 dirty，并记录一次 miss
	}
	if !ok {
		return nil, false
	}
	return e.load() // 一次原子读
}
```

**命中 read 表 = 一次原子指针读取**，不需要取得 `m.mu`。这是本次稳定 key 基准拉开差距的主要原因；它不是“一发 CAS”，也不是所有 `Load` 都无锁。miss（key 不在 read 表里）且 `amended` 为真时，会拿 `m.mu` 查 dirty 并累计 miss；新 key、删除后重新插入和 dirty 提升都会改变这条路径。



![sync.Map 内部双表架构：read (只读无锁 atomic.Value) 与 dirty (加锁全量)](../../../public/images/sync-map-read-dirty-entry-state-machine.svg)

## 二、两组实测：把稳定命中与已有 key 写入分开

统一入口跑三个相互独立的子基准（完整源码见文末，先进入 `experiments` 再执行命令）：读和写都用 8 个已经存在的 `int` key，`-cpu=8`，读基准用 `b.RunParallel`；写基准只改变已有 key，不把“持续新增 key”和“覆盖已有 key”混成一个数字。

| 场景 | sync.Map | `RWMutex` + map | 对照 | 赢家 |
| --- | --- | --- | --- | --- |
| 8 key 并发读 | **1.485ns/op，0 alloc** | 95.62ns/op，0 alloc | `atomic.Value` 读：0.2943ns/op | sync.Map 在这组稳定 key 上更快 |
| 8 key 并发写（覆盖已有 key） | 168.0ns/op，48B/1 alloc | **108.9ns/op，0 alloc** | — | 普通 map 更快 |

三个结论，各自反直觉：

1. **读路径的优势来自稳定命中，不是“并发 map”标签**：本次 8 个 key 预先写入 read 表，8 个并行 worker 只做命中读取。如果 key 集合在运行中不断增长，新增 key 需要走 dirty 路径；不能把 1.485ns 当成任意 key 分布的读延迟。
2. **覆盖已有 key 也可能输给普通 map**：本次写基准里 `sync.Map` 比 `RWMutex` map 慢约 54%，并且报告了 48B/1 alloc。这个结果与源码机制相符：`Store` 需要处理 interface 值和 entry 状态，具体分配形状还受编译器、值类型与实现版本影响；它不是一个可免费替代锁的写容器。
3. **单值读取不需要 map**：如果业务实际上只有一个版本化配置或一个热值，`atomic.Value` 的 0.2943ns 对照说明应该先建模状态，再决定是否需要 `sync.Map`。这不是“atomic.Value 一定更快”的普遍证明，只是当前相同机器上的对照路径。

复现实验时使用同一个实验入口；下面的命令会把其他近期 Go 边界基准也一起跑出，原始分组输出保存在文末的 evidence 路径中：

```bash
cd experiments
go test ./go-runtime-boundary -run '^$' -bench '^(BenchmarkSyncMapReadParallel|BenchmarkSyncMapWriteParallel|BenchmarkAtomicValueReadParallel)$' -benchmem -benchtime=1s -cpu=8
```

## 三、周期税：dirty 提升的搬家费

写路径真正需要单独测量的是**新 key 的落库**和**整表搬家**。当 read 表没有某个 key 且 `amended` 为真时，`Store` 的路径会取得 `m.mu`；`dirtyLocked` 可能把 read 表中的可用 entry 拷贝进 dirty，再完成插入。

```go
func (m *Map) missLocked() {
	m.misses++
	if m.misses < len(m.dirty) {
		return
	}
	m.read.Store(&readOnly{m: m.dirty}) // 整表提升
	m.dirty = nil
	m.misses = 0
}
```

这就是 `amended` 标志存在的意义：read 表和 dirty 表不一致时，**每次慢路径 miss 都会累计**，达到 dirty 表规模后再把 dirty 提升为新的 read。搬家费可以被均摊，但它不是免费的；key 集合持续膨胀、反复 miss 或频繁增删时，dirty 表和锁竞争都会进入真实成本。本文没有用一个未单独采集的数字替代这段机制，而是把它作为必须补测的 workload 分支。



![并发 Map 选型四象限：sync.Map vs RWMutex+Map vs 分段锁分界线](../../../public/images/sync-map-vs-rwmutex-map-benchmark-quadrant.svg)

## 四、四个坑：源码注释里写好的代价

1. **类型是 `any`**：每次取出都要类型断言，热路径上一发断言换一个「省掉锁」的收益，断言失败的那条路径会 panic——这是把性能收益换成运行时检查。
2. **删除不是快照回收协议**：entry 的删除、expunged 和 dirty 重建由 `sync.Map` 内部状态机处理，不能把 `Delete` 理解成普通 map 的立即收缩。高频增删应单独测量内存曲线与 miss 路径，不要只看命中 `Load`。
3. **某些首次进入 dirty 路径的写很贵**：已有 read 表且 dirty 为 nil 时，`dirtyLocked` 需要建立 dirty 表并复制当前可用 entry；空 map 的第一次写不承担同等规模的搬家费。不要把“第一笔写很贵”当成所有初始化场景的经验常数，应按既有 key、miss 和增删形状测量。
4. **复杂 API 是信号**：`LoadOrStore`、`CompareAndSwap`、`Range` 都有自己的原子性和遍历语义；尤其 `Range` 不提供一个冻结的全局快照。如果业务要一致性快照，通常应使用受锁保护的普通 map，在锁内复制出副本再遍历。

## 五、选型表：什么时候买哪张票

| 场景 | 选择 | 理由 |
| --- | --- | --- |
| 一次写入、后续多次读取的缓存项 | `sync.Map` | 官方文档明确列出的专用场景；本次稳定 key 读为 1.485ns/op |
| 不同 goroutine 访问基本不相交的 key 集合 | `sync.Map` | 另一类专用场景；仍需验证 miss、删除和内存生命周期 |
| 单个版本化配置或热值 | `atomic.Value` | 本次对照读为 0.2943ns/op，不需要 map 的 key 语义 |
| 写密集、key 集合增长 | `map` + `Mutex`/分片锁 | 本次已有 key 写入为 108.9ns、0 alloc；结构更直接 |
| 需要遍历/快照一致性 | `map` + 锁后复制 | `sync.Map.Range` 不保证冻结快照 |

两个诚实的补充：普通 map 的遍历仍需要由调用方提供同步；`maps.Clone` 可以帮助复制，但不能替你绕过锁。分片 map（每片自己的锁）在**写分散**的场景可以降低单锁竞争，同时把 key 类型、删除和快照边界写得更直白——这不是“必然更快”，而是值得用同一 workload 对照的替代方案。

## 六、结论：先证明工作负载，再决定是否使用 sync.Map

`sync.Map` 的稳定命中读路径很便宜，但这不是通用 map 的性能承诺：本次 8 key 并发读是 **1.485ns/op**，同一组已有 key 并发写却是 **168.0ns/op、48B/1 alloc**，普通 `RWMutex` map 为 **108.9ns/op、0 alloc**。因此不应再用“读占比超过 99%”这类脱离 workload 的阈值做选型；真正要问的是：key 是一次写入后长期读取，还是持续新增/删除？是否需要快照？值的类型和生命周期是什么？

这次数字来自单机 Go 1.25.1/arm64、8 个 int key 和 8 个并发 P，只证明该输入下的相对形状。它没有覆盖 miss、key 持续增长、删除回收、不同值大小、分片锁或生产尾延迟；这些分支需要在你的实际访问分布上补测。

下一步可做的事：把项目里的每个 `sync.Map` 按“稳定 key / 持续 miss / 增删 / 是否需要快照”分类，再用同样的 key 分布和 goroutine 数量对照 `sync.Map`、普通 map、分片 map；命令使用 `-benchmem`，不要误写成 `-benchbenchmem`，也不要用一次顺序调用通过替代并发证据。

## 参考资料

1. Go 源码 `src/sync/map.go`（read/dirty 双表、missLocked/dirtyLocked、expunged 语义）—— Go 1.25.1 本机源码
2. Go 官方文档 `sync.Map` 类型注释（read-mostly 场景声明）—— https://pkg.go.dev/sync#Map
3. 前作：[Go 锁成本：futex、自旋与内核唤醒的三档价目](/writing/go-lock-cost-futex-rwlock)、[多核的假象：缓存一致性（MESI）与伪共享这笔税](/writing/mesi-cache-coherence-false-sharing)
4. 本文实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkSyncMapReadParallel`、`BenchmarkSyncMapWriteParallel`、`BenchmarkAtomicValueReadParallel`）；环境与原始输出：`evidence/go-runtime-boundary/2026-08-16-local/`。
