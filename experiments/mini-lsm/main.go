// 迷你 LSM：写放大 / 读放大 / 空间放大 的字节账模拟器。
//
// 不碰真实磁盘——放大率的定义本来就是"字节账 + 随机 IO 探测次数"，与磁盘时序无关：
//   - 写放大 = (flush 输出字节 + 全部 compaction 输出字节) / 用户写入字节
//   - 读放大 = 一次点查在 SST 上做的随机 IO 次数（键范围判断与 bloom 判断是内存操作，不计 IO）
//   - 空间放大 = 运行期磁盘峰值字节 / 逻辑存活字节
//
// 实现的是一个可以真实写入、落盘、合并的内存版 LSM：
//   memtable（满就落盘，对应真实引擎的 immutable memtable）→ L0 / tier0 → 逐级合并。
//   键带全局自增 seq，同键保留最新版本；合并时旧版本被丢弃——这正是"写放大"的来源：
//   同一份数据在合并时被物理重写多遍。
//
// 键模型：唯一键是 [0, 2*num) 里的偶数，共 num 个；点查的"不存在"键取奇数，
//   保证它在所有 SST 的键范围内（不触发范围剪枝），考验的才是 bloom，而不是巧合。
//
// 运行（在 experiments 目录，模块根）：
//   go run ./mini-lsm                          # 默认：Leveled 与 Size-Tiered 各跑一遍，打对比表
//   go run ./mini-lsm -ratio 4                 # 调 T（每层尺寸比），看写/读/空间放大怎么变
//   go run ./mini-lsm -bits-per-key 20         # 调 bloom 每键位数 m/n，看读放大怎么变
//   go run ./mini-lsm -sweep                   # 扫 T：输出写/读/空间放大表（文章第四节的曲线数据）
//   go run ./mini-lsm -sweep -csv              # 扫 T 并输出 CSV，便于直接画图
package main

import (
	"flag"
	"fmt"
	"math"
	"math/rand"
	"sort"
)

// kv 表示对一个键的一次写入；seq 全局单调递增，同键保留最大 seq（最新版本）。
type kv struct {
	key uint64
	seq uint64
}

// sst 是一段已排序、已去重（每键只留最高 seq）的键集合。
// lo/hi 是键范围：点查先做零 IO 的剪枝（键不在范围内直接跳过）。
type sst struct {
	id     int
	lev    int
	size   int64 // 记账字节 = len(kv) * entry
	lo, hi uint64
	maxSeq uint64 // 文件内最新 seq：点查按它降序探测，新文件优先
	kv     []kv
}

type config struct {
	num     int     // 唯一键数（逻辑数据规模 = num * entry 字节）
	writes  int     // 总写次数（含对已有键的更新）
	mem     int     // memtable 条目数，满则落盘
	ratio   float64 // 每层尺寸比 T（Leveled 的 level multiplier）
	levels  int     // 最大层级，0 = 按数据量自适应
	l0      int     // Leveled：L0 凑满几份文件触发合并
	bitsKey int     // bloom 每键位数 m/n，假阳性率由公式 p=(1-e^{-k/(m/n)})^k 推出
	k       int     // bloom 哈希函数个数 k
	lookups int     // 点查采样数（一半存在、一半不存在）
	seed    int64
	entry   int64  // 每条记录记账字节数
	policy  string // leveled | sizetiered
}

type sim struct {
	cfg          config
	levels       [][]*sst
	rng          *rand.Rand
	nextID       int
	totalWritten int64 // flush + compaction 输出字节
	liveBytes    int64 // 磁盘上存活 SST 总字节
	peakLive     int64
	flushCount   int
	mergeCount   int
}

func newSim(c config) *sim {
	s := &sim{
		cfg:    c,
		levels: make([][]*sst, 1),
		rng:    rand.New(rand.NewSource(c.seed)),
	}
	return s
}

// 最深允许层级：levels>0 时强制压进固定层数（最深一层吸收溢出）；0 表示自适应。
func (s *sim) capLev() int {
	if s.cfg.levels > 0 {
		return s.cfg.levels - 1
	}
	return -1
}

func (s *sim) ensureLevel(lev int) {
	if max := s.capLev(); max >= 0 && lev > max {
		lev = max
	}
	for len(s.levels) <= lev {
		s.levels = append(s.levels, nil)
	}
}

// 把一批写入排序、去重（同键保留最新 seq）后落盘为 L0 的新 SST，记为一次 flush。
func (s *sim) flush(batch []kv) {
	sorted := make([]kv, len(batch))
	copy(sorted, batch)
	sort.Slice(sorted, func(a, b int) bool { return sorted[a].key < sorted[b].key })
	st := s.newSST(0, sorted)
	s.levels[0] = append(s.levels[0], st)
	s.totalWritten += st.size
	s.liveBytes += st.size
	if s.liveBytes > s.peakLive {
		s.peakLive = s.liveBytes
	}
	s.flushCount++
}

// newSST 去重并计算键范围 / 大小 / 文件内最新 seq。
func (s *sim) newSST(lev int, sorted []kv) *sst {
	out := make([]kv, 0, len(sorted))
	for i := 0; i < len(sorted); i++ {
		k := sorted[i].key
		best := sorted[i].seq
		j := i + 1
		for j < len(sorted) && sorted[j].key == k {
			if sorted[j].seq > best {
				best = sorted[j].seq
			}
			j++
		}
		out = append(out, kv{k, best})
		i = j - 1
	}
	st := &sst{id: s.nextID, lev: lev, kv: out, size: int64(len(out)) * s.cfg.entry}
	s.nextID++
	st.lo = out[0].key
	st.hi = out[len(out)-1].key
	for _, e := range out {
		if e.seq > st.maxSeq {
			st.maxSeq = e.seq
		}
	}
	return st
}

// kWayMerge 归并多个有序输入，同键保留最大 seq（丢弃旧版本——写放大的字节就是这么被重写的）。
func kWayMerge(runs [][]kv) []kv {
	var res []kv
	for {
		bestKey := uint64(math.MaxUint64)
		found := false
		var bestSeq uint64
		for _, r := range runs {
			if len(r) == 0 {
				continue
			}
			k := r[0].key
			if !found || k < bestKey {
				bestKey = k
				bestSeq = r[0].seq
				found = true
			} else if k == bestKey && r[0].seq > bestSeq {
				bestSeq = r[0].seq
			}
		}
		if !found {
			break
		}
		res = append(res, kv{bestKey, bestSeq})
		for ri := range runs {
			if len(runs[ri]) > 0 && runs[ri][0].key == bestKey {
				runs[ri] = runs[ri][1:]
			}
		}
	}
	return res
}

// 把 inputs 从各自层级移除，并从存活字节里扣除。
func (s *sim) removeInputs(inputs []*sst) {
	removed := make(map[int]bool, len(inputs))
	total := int64(0)
	for _, f := range inputs {
		removed[f.id] = true
		total += f.size
	}
	for lev := range s.levels {
		kept := s.levels[lev][:0]
		for _, f := range s.levels[lev] {
			if !removed[f.id] {
				kept = append(kept, f)
			}
		}
		s.levels[lev] = kept
	}
	s.liveBytes -= total
}

// 合并一批输入，输出放到 dstLev（受层级上限约束），并记入总写入与存活字节。
func (s *sim) mergeOutput(dstLev int, inputs []*sst) {
	dst := dstLev
	if max := s.capLev(); max >= 0 && dst > max {
		dst = max
	}
	var runs [][]kv
	for _, in := range inputs {
		runs = append(runs, in.kv)
	}
	out := s.newSST(dst, kWayMerge(runs))
	s.ensureLevel(dst)
	s.levels[dst] = append(s.levels[dst], out)
	s.totalWritten += out.size
	s.liveBytes += out.size
	if s.liveBytes > s.peakLive {
		s.peakLive = s.liveBytes
	}
	s.mergeCount++
}

func (s *sim) levelBytes(lev int) int64 {
	t := int64(0)
	for _, f := range s.levels[lev] {
		t += f.size
	}
	return t
}

// Leveled：第 lev 层的目标尺寸 = memtable 字节 * T^lev（RocksDB 的 level 之间 10 倍率就是这个）。
func (s *sim) targetSize(lev int) int64 {
	if lev <= 0 {
		return math.MaxInt64
	}
	return int64(float64(s.cfg.mem) * float64(s.cfg.entry) * math.Pow(s.cfg.ratio, float64(lev)))
}

func rangesOverlap(a, b *sst) bool { return a.lo <= b.hi && b.lo <= a.hi }

// 挑出 L0 里最老的 n 份文件（maxSeq 最小）：先落盘的数据最该先被下压。
func (s *sim) oldestL0Batch(n int) []*sst {
	idxs := make([]int, len(s.levels[0]))
	for i := range idxs {
		idxs[i] = i
	}
	sort.Slice(idxs, func(a, b int) bool {
		return s.levels[0][idxs[a]].maxSeq < s.levels[0][idxs[b]].maxSeq
	})
	if len(idxs) > n {
		idxs = idxs[:n]
	}
	out := make([]*sst, 0, len(idxs))
	for _, i := range idxs {
		out = append(out, s.levels[0][i])
	}
	return out
}

// 挑出 lev 层里"压进下一层时重叠字节最多"的文件（模拟 RocksDB 的重叠启发式）。
func (s *sim) pickMaxOverlap(lev int) *sst {
	var best *sst
	bestOv := int64(-1)
	for _, f := range s.levels[lev] {
		ov := int64(0)
		for _, g := range s.levels[lev+1] {
			if rangesOverlap(f, g) {
				ov += g.size
			}
		}
		if ov > bestOv || (ov == bestOv && best != nil && f.size > best.size) {
			best = f
			bestOv = ov
		}
	}
	return best
}

// Leveled 合并调度，返回是否有任何合并发生。
//
// 第 1 层必须在第一轮就存在，否则 L0 永远没有合并对象——这是从"能跑但从不合并"
// 到"真的在逐级下压"的关键。
func (s *sim) compactLeveled() bool {
	did := false

	// 1) L0 凑满 l0 份时，把最老的 l0 份（带 L1 重叠文件）合并进 L1。
	//    一次下压一批：既不逐文件拖拽 T 倍大的 L1（那会把写放大顶到最坏上界之上），
	//    也不整批清空 L0，介于两者之间，贴近 RocksDB 的批次语义。
	for len(s.levels[0]) >= s.cfg.l0 {
		s.ensureLevel(1)
		inputs := s.oldestL0Batch(s.cfg.l0)
		if len(inputs) == 0 {
			break
		}
		for _, f := range s.levels[1] {
			for _, g := range inputs {
				if rangesOverlap(g, f) {
					inputs = append(inputs, f)
					break
				}
			}
		}
		s.removeInputs(inputs)
		s.ensureLevel(1)
		s.mergeOutput(1, inputs)
		did = true
	}

	// 2) 第 1 层起：只要不是真正底部层，超目标就把重叠最多的文件并进下一层。
	//    底部层由"数据量在哪层放得下"决定，而不是"当前已存在几层"——
	//    否则 L1 永远被当成末层，数据全堆在 L1，层数不会增长。
	bottom := s.bottomLevel()
	for lev := 1; lev < bottom; lev++ {
		s.ensureLevel(lev)
		for s.levelBytes(lev) > s.targetSize(lev) {
			s.ensureLevel(lev + 1)
			pick := s.pickMaxOverlap(lev)
			if pick == nil {
				break
			}
			inputs := []*sst{pick}
			for _, g := range s.levels[lev+1] {
				if rangesOverlap(pick, g) {
					inputs = append(inputs, g)
				}
			}
			s.removeInputs(inputs)
			s.mergeOutput(lev+1, inputs)
			did = true
		}
	}
	return did
}

// 真正的底部层：逻辑存活字节能全部容纳的最小层（或 levels 参数给定的硬上限）。
// 底部层只吸收、不再下压——这是 leveled 空间放大接近 1 的前提。
func (s *sim) bottomLevel() int {
	total := int64(s.cfg.num) * s.cfg.entry
	for lev := 1; ; lev++ {
		if max := s.capLev(); max >= 0 && lev >= max {
			return max
		}
		if s.targetSize(lev) >= total {
			return lev
		}
	}
}

// Size-Tiered 合并调度：同一 tier 攒够 T 个尺寸相近的 run 就合成 1 个更大的 run，上升一层。
func (s *sim) compactSizetiered() bool {
	did := false
	t := int(s.cfg.ratio)
	if t < 2 {
		t = 2
	}
	for lev := 0; lev < len(s.levels); lev++ {
		for len(s.levels[lev]) >= t {
			idxs := s.tierSmallest(lev, t)
			if len(idxs) < t {
				break
			}
			var inputs []*sst
			for _, i := range idxs {
				inputs = append(inputs, s.levels[lev][i])
			}
			s.removeInputs(inputs)
			s.ensureLevel(lev + 1)
			s.mergeOutput(lev+1, inputs)
			did = true
		}
	}
	return did
}

func (s *sim) tierSmallest(lev, t int) []int {
	type idxSize struct{ i int; sz int64 }
	rows := make([]idxSize, len(s.levels[lev]))
	for i, f := range s.levels[lev] {
		rows[i] = idxSize{i, f.size}
	}
	sort.Slice(rows, func(a, b int) bool { return rows[a].sz < rows[b].sz })
	out := make([]int, 0, t)
	for i := 0; i < t && i < len(rows); i++ {
		out = append(out, rows[i].i)
	}
	return out
}

// 跑完一轮调度，返回是否有任何合并。
func (s *sim) compact() bool {
	if s.cfg.policy == "sizetiered" {
		return s.compactSizetiered()
	}
	return s.compactLeveled()
}

func (s *sim) run() {
	batch := make([]kv, 0, s.cfg.mem)
	written := 0
	flushBatch := func() {
		if len(batch) > 0 {
			s.flush(batch)
			batch = batch[:0]
			for s.compact() {
			}
		}
	}
	// 阶段 1：每个唯一键各写一次（打乱顺序），保证 num 个键全部存活——
	// 空间放大的分母"逻辑存活字节"才站得住（否则随机命中不到的部分键会虚高放大倍数）。
	for _, ki := range s.rng.Perm(s.cfg.num) {
		batch = append(batch, kv{uint64(2 * ki), uint64(written + 1)})
		written++
		if len(batch) >= s.cfg.mem {
			flushBatch()
		}
	}
	// 阶段 2：剩余写入全部是随机更新，制造"同键多版本 → 合并时丢弃旧版本"的写放大。
	for written < s.cfg.writes {
		batch = append(batch, kv{uint64(2 * s.rng.Intn(s.cfg.num)), uint64(written + 1)})
		written++
		if len(batch) >= s.cfg.mem {
			flushBatch()
		}
	}
	flushBatch()
}

// 新文件优先：按文件内最新 seq 降序，作为点查的探测顺序。
func (s *sim) probeOrder() []*sst {
	var all []*sst
	for lev := range s.levels {
		all = append(all, s.levels[lev]...)
	}
	sort.Slice(all, func(a, b int) bool { return all[a].maxSeq > all[b].maxSeq })
	return all
}

func (s *sst) contains(key uint64) bool {
	lo, hi := 0, len(s.kv)-1
	for lo <= hi {
		mid := (lo + hi) / 2
		switch {
		case s.kv[mid].key < key:
			lo = mid + 1
		case s.kv[mid].key > key:
			hi = mid - 1
		default:
			return true
		}
	}
	return false
}

// 由公式推出的 bloom 假阳性率：m/n 每键位数、k 个哈希，p = (1 - e^{-k/(m/n)})^k。
// 这是文章里那张公式的直接落点——模拟器不用拍脑袋的"假阳性率"，而是把位数喂进公式。
func bloomFP(bitsPerKey, k int) float64 {
	x := float64(k) / float64(bitsPerKey)
	return math.Pow(1-math.Exp(-x), float64(k))
}

// 模拟一次点查，返回 [有 bloom, 无 bloom] 的随机 IO 探测次数。
// 键范围不含 → 零 IO；范围含但 bloom 拒 → 零 IO；bloom 放行（或真含）→ 1 次 IO。
func (s *sim) lookup(key uint64) (int, int) {
	fp := bloomFP(s.cfg.bitsKey, s.cfg.k)
	bloom, plain := 0, 0
	stopBloom, stopPlain := false, false
	for _, f := range s.probeOrder() {
		if key < f.lo || key > f.hi {
			continue
		}
		if !stopPlain {
			plain++
			if f.contains(key) {
				stopPlain = true
			}
		}
		if !stopBloom {
			contains := f.contains(key)
			pass := contains || s.rng.Float64() < fp
			if pass {
				bloom++
				if contains {
					stopBloom = true
				}
			}
		}
		if stopBloom && stopPlain {
			break
		}
	}
	return bloom, plain
}

type lookupResult struct {
	presentBloom, presentPlain int
	absentBloom, absentPlain   int
}

func (s *sim) sampleLookups() lookupResult {
	half := s.cfg.lookups / 2
	var r lookupResult
	for i := 0; i < half; i++ {
		b, p := s.lookup(uint64(2 * s.rng.Intn(s.cfg.num))) // 存在：偶数
		r.presentBloom += b
		r.presentPlain += p
	}
	for i := 0; i < half; i++ {
		b, p := s.lookup(uint64(2*s.rng.Intn(s.cfg.num) + 1)) // 不存在：奇数，但落在键范围内
		r.absentBloom += b
		r.absentPlain += p
	}
	return r
}

// 实测层数：最后一层不空则它是实层。
func (s *sim) usedLevels() int {
	n := 0
	for lev := range s.levels {
		if len(s.levels[lev]) > 0 {
			n = lev + 1
		}
	}
	return n
}

func (s *sim) metrics() (wa, sa, raPresBloom, raPresPlain, raAbsBloom, raAbsPlain float64, levs int) {
	userBytes := int64(s.cfg.writes) * s.cfg.entry      // 用户真正写下的字节（含更新）
	liveBytes := int64(s.cfg.num) * s.cfg.entry          // 逻辑存活字节（无删除，约等于唯一键数）
	r := s.sampleLookups()
	half := s.cfg.lookups / 2
	return float64(s.totalWritten) / float64(userBytes),
		float64(s.peakLive) / float64(liveBytes),
		float64(r.presentBloom) / float64(half),
		float64(r.presentPlain) / float64(half),
		float64(r.absentBloom) / float64(half),
		float64(r.absentPlain) / float64(half),
		s.usedLevels()
}

func (s *sim) report(name string) {
	wa, sa, pb, pp, ab, ap, levs := s.metrics()
	half := s.cfg.lookups / 2
	fp := bloomFP(s.cfg.bitsKey, s.cfg.k)
	fmt.Printf("===== %s =====\n", name)
	fmt.Printf("  层数(实测)          : %d\n", levs)
	fmt.Printf("  flush 次数          : %d, 合并次数: %d\n", s.flushCount, s.mergeCount)
	fmt.Printf("  用户写入            : %d 次 x %d B = %.2f MB\n", s.cfg.writes, s.cfg.entry, float64(int64(s.cfg.writes)*s.cfg.entry)/1e6)
	fmt.Printf("  逻辑存活            : %d 键 x %d B = %.2f MB\n", s.cfg.num, s.cfg.entry, float64(int64(s.cfg.num)*s.cfg.entry)/1e6)
	fmt.Printf("  总写入(flush+compaction) : %.2f MB\n", float64(s.totalWritten)/1e6)
	fmt.Printf("  写放大 总写入/用户写入 = %.1fx\n", wa)
	fmt.Printf("  空间放大 峰值磁盘/存活 = %.2fx\n", sa)
	fmt.Printf("  点查探测 存在键(采样 %d)\n", half)
	fmt.Printf("    无 bloom : 平均 %.1f 次随机 IO\n", pp)
	fmt.Printf("    有 bloom : 平均 %.2f 次随机 IO (假阳性率 %.2f%%)\n", pb, fp*100)
	fmt.Printf("  点查探测 不存在键(采样 %d)\n", half)
	fmt.Printf("    无 bloom : 平均 %.1f 次随机 IO\n", ap)
	fmt.Printf("    有 bloom : 平均 %.2f 次随机 IO\n", ab)
	fmt.Println()
}

func runOnce(c config) (name string, wa, sa, pb, pp, ab, ap float64, levs int) {
	name = c.policy
	s := newSim(c)
	s.run()
	wa, sa, pb, pp, ab, ap, levs = s.metrics()
	return
}

// 扫 T：固定 num/writes/mem，把写/读/空间放大作为 T 的函数打出来——文章第四节的曲线数据。
func sweep(c config, csv bool) {
	tmins := []float64{2, 4, 8, 12, 20, 30, 40, 60}
	fmt.Printf("# 扫 T：num=%d writes=%d mem=%d bloom m/n=%d k=%d\n",
		c.num, c.writes, c.mem, c.bitsKey, c.k)
	fmt.Printf("# bloom 假阳性率按公式 p=(1-e^{-k/(m/n)})^k = %.2f%%\n", bloomFP(c.bitsKey, c.k)*100)
	if csv {
		fmt.Printf("# T,pol,levs,wa,sa,ra_present_nobloom,ra_present_bloom,ra_absent_nobloom,ra_absent_bloom\n")
	} else {
		fmt.Printf("| T | 策略 | 层数 | 写放大 | 空间放大 | 点查探测 存在/无bloom | 存在/有bloom | 不存在/无bloom | 不存在/有bloom |\n")
		fmt.Printf("|---:|---|---:|---:|---:|---:|---:|---:|---:|\n")
	}
	for _, t := range tmins {
		for _, pol := range []string{"leveled", "sizetiered"} {
			cc := c
			cc.policy = pol
			cc.ratio = t
			name, wa, sa, pb, pp, ab, ap, levs := runOnce(cc)
			if csv {
				fmt.Printf("%g,%s,%d,%.2f,%.2f,%.1f,%.2f,%.1f,%.2f\n",
					t, name, levs, wa, sa, pp, pb, ap, ab)
			} else {
				fmt.Printf("| %g | %s | %d | %.1fx | %.2fx | %.1f | %.2f | %.1f | %.2f |\n",
					t, name, levs, wa, sa, pp, pb, ap, ab)
			}
		}
	}
}

func main() {
	c := config{}
	policy := flag.String("policy", "both", "leveled | sizetiered | both（默认 both）")
	flag.IntVar(&c.num, "num", 1000000, "唯一键数(逻辑数据规模)")
	flag.IntVar(&c.writes, "writes", 1200000, "总写次数(含更新)")
	flag.IntVar(&c.mem, "mem", 10000, "memtable 条目数,满则落盘")
	flag.Float64Var(&c.ratio, "ratio", 10, "每层尺寸比 T")
	flag.IntVar(&c.levels, "levels", 0, "最大层级,0=自适应")
	flag.IntVar(&c.l0, "l0", 4, "L0 合并触发的文件数(仅 leveled)")
	flag.IntVar(&c.bitsKey, "bits-per-key", 10, "bloom 每键位数 m/n(假阳性率由公式推出)")
	flag.IntVar(&c.k, "k", 7, "bloom 哈希个数 k")
	flag.IntVar(&c.lookups, "lookups", 20000, "点查采样数(一半存在,一半不存在)")
	flag.Int64Var(&c.seed, "seed", 42, "随机种子(固定保证可复现)")
	sweepFlag := flag.Bool("sweep", false, "扫 T 输出写/读/空间放大表")
	csvFlag := flag.Bool("csv", false, "配合 -sweep 输出 CSV")
	entry := flag.Int64("entry", 128, "每条记录记账字节数")
	flag.Parse()
	c.entry = *entry

	if *sweepFlag {
		sweep(c, *csvFlag)
		return
	}

	policies := []string{"leveled", "sizetiered"}
	if *policy == "leveled" || *policy == "sizetiered" {
		policies = []string{*policy}
	}
	for _, p := range policies {
		cc := c
		cc.policy = p
		s := newSim(cc)
		s.run()
		s.report(p)
	}
}
