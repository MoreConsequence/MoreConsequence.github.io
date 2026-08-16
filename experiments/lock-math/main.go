package main

// optimistic-vs-pessimistic-lock 的配套模拟实验
//
// 核心问题: "读多写少用乐观锁, 读少写多用悲观锁" 是一句没量化的话。
// 两个模式的对比口径:
//
//	mode=sweep : 受控对照 —— 冲突率 p 是自变量(每次尝试以概率 p 失败),
//	             验证乐观锁期望尝试次数 E[attempts] = 1/(1-p)
//	             (即期望重试次数 p/(1-p)), 并与悲观锁的 FIFO 排队延迟
//	             (N 个并发事务同时到达时平均延迟 ≈ (N+1)/2 × 持锁时间)
//	             比较, 输出交叉点。随机部分: 乐观锁的几何分布尝试;
//	             确定性部分: 悲观锁的 FIFO 队列。时间是"模拟成本单位"。
//	mode=storm : 热行秒杀 —— 事件交错模拟, 复现乐观锁在热行上的重试风暴:
//	             一次成功提交使所有"在途读者"持有的版本号失效, 全部重试,
//	             重试者又彼此碰撞 → 总尝试次数随并发度超线性放大。
//	             对比悲观锁(互斥锁)把同样的事务串行化, 无浪费尝试。
//
// 所有数值是模拟成本单位(微秒), 不代表真实 MySQL 延迟;
// 真实延迟需对 DB 压测后回填正文【本机实测待补】。
//
// 运行:
//
//	go run .                          # 默认 mode=sweep
//	go run . -mode storm -k 64
//	go run . -a 100 -s 200            # 改乐观单次尝试/悲观持锁成本
//
// 输出: 表格打印 + sweep.csv/storm.csv(给外部绘图) + crossover.svg(交叉点曲线)。

import (
	"bufio"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	defAttempt = 100.0 // µs, 乐观锁一次尝试(读版本 + 条件更新)的模拟成本
	defHold    = 200.0 // µs, 悲观锁持锁服务时间(读 + 更新 + 提交)
)

// ---------- 工具 ----------

// geoAttempts 单事务按几何分布抽取"直到成功所需的尝试次数"。
// 每次尝试以概率 p 冲突失败, 成功概率 1-p, E[attempts] = 1/(1-p)。
func geoAttempts(p float64, r *rand.Rand) int {
	n := 1
	for r.Float64() < p { // 本次尝试失败 → 重试
		n++
	}
	return n
}

func fmtDur(us float64) string {
	if us >= 1e3 {
		return fmt.Sprintf("%.0fms", us/1e3)
	}
	if us >= 1 {
		return fmt.Sprintf("%.0fus", us)
	}
	return fmt.Sprintf("%.3fus", us)
}

// ---------- mode=sweep ----------

type sweepCfg struct {
	a, s    float64 // 乐观单次尝试成本, 悲观持锁成本(µs)
	pSet    []float64
	nSet    []int
	samples int // 公式验证的独立抽样次数
}

func runSweep(c sweepCfg) {
	r := rand.New(rand.NewSource(20260816))
	fmt.Println("== mode=sweep: 受控对照(冲突率 p 为自变量) ==")
	fmt.Println("== 模型: 乐观 avg_latency = a/(1-p); 悲观(N 并发同达) avg_latency = (N+1)/2 * s ==")
	fmt.Printf("== a(乐观单次尝试)=%.0fus  s(悲观持锁)=%.0fus  成本比 s/a=%.2f ==\n\n", c.a, c.s, c.s/c.a)

	// (1) 公式验证: 独立几何抽样 vs 1/(1-p)
	fmt.Println("--- 公式验证: E[attempts] = 1/(1-p), E[retries] = p/(1-p) ---")
	fmt.Printf("%-8s %-12s %-14s %-10s\n", "p", "测得均值(尝试)", "理论1/(1-p)", "重试p/(1-p)")
	for _, p := range c.pSet {
		sum := 0
		for i := 0; i < c.samples; i++ {
			sum += geoAttempts(p, r)
		}
		meas := float64(sum) / float64(c.samples)
		fmt.Printf("%-8.2f %-12.2f %-14.2f %-10.2f\n", p, meas, 1/(1-p), p/(1-p))
	}
	fmt.Println()

	// (2) 并发网格: 乐观 vs 悲观
	fmt.Println("--- 并发网格: 每格平均延迟与胜者 (µs) ---")
	fmt.Printf("%-7s", "p\\N")
	for _, n := range c.nSet {
		fmt.Printf("%-8d", n)
	}
	fmt.Println()
	for _, p := range c.pSet {
		fmt.Printf("%-7.2f", p)
		for _, n := range c.nSet {
			// 乐观: N 个事务各抽一次几何尝试数, 平均延迟 = 均值 × a
			sum := 0
			for i := 0; i < n; i++ {
				sum += geoAttempts(p, r)
			}
			opt := float64(sum) / float64(n) * c.a
			// 悲观: N 个并发同达 FIFO, 平均延迟 = (N+1)/2 * s
			pes := (float64(n) + 1) / 2 * c.s
			w := "O" // optimistic 胜
			if pes < opt {
				w = "P" // pessimistic 胜
			}
			fmt.Printf("%-8s", fmt.Sprintf("%s %d", w, int(math.Round(opt))))
		}
		fmt.Println()
	}
	fmt.Println("(O=乐观胜, P=悲观胜; 格内数字为乐观平均延迟 µs; 悲观同 N 为常量 (N+1)/2*s)")

	// (3) CSV: 每 (p,N) 的 opt/pes 延迟与胜者
	f, err := os.Create("sweep.csv")
	if err != nil {
		fmt.Fprintln(os.Stderr, "写 sweep.csv 失败:", err)
		return
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	defer w.Flush()
	fmt.Fprintln(w, "p,N,opt_us,pes_us,winner")
	for _, p := range c.pSet {
		for _, n := range c.nSet {
			opt := c.a / (1 - p)
			pes := (float64(n) + 1) / 2 * c.s
			winner := "opt"
			if pes < opt {
				winner = "pes"
			}
			fmt.Fprintf(w, "%.3f,%d,%.1f,%.1f,%s\n", p, n, opt, pes, winner)
		}
	}
	fmt.Println("\nsweep.csv 已写出(供外部绘图)。")

	// (4) 交叉点曲线 SVG: 固定 N, 画乐观随 p 上升曲线 vs 悲观常量线
	for _, n := range []int{20, 100} {
		writeCrossoverSVG("crossover", n, c)
	}
}

// writeCrossoverSVG 画"冲突率曲线": 固定并发度 N, 乐观延迟随 p 上升,
// 悲观延迟是与 p 无关的常量线; 交点即交叉点 p*。
func writeCrossoverSVG(base string, n int, c sweepCfg) {
	pes := (float64(n) + 1) / 2 * c.s
	// 交叉点 p* = 1 - a / pes = 1 - 2a/(s(N+1))
	pStar := 1 - c.a/pes
	if pStar < 0 {
		pStar = 0
	}
	if pStar > 0.999 {
		pStar = 0.999
	}
	ptsOpt := make([][2]float64, 0, len(c.pSet))
	for _, p := range c.pSet {
		ptsOpt = append(ptsOpt, [2]float64{p, c.a / (1 - p)})
	}
	// 悲观曲线: 常量线, 横跨 p 轴
	ptsPes := make([][2]float64, len(c.pSet))
	for i, p := range c.pSet {
		ptsPes[i] = [2]float64{p, pes}
	}
	title := fmt.Sprintf("N=%d 并发竞争同一行: 乐观重试税 vs 悲观排队税", n)
	labels := []string{"乐观(重试税)", "悲观(排队税)"}
	name := fmt.Sprintf("%s_N%d.svg", base, n)
	writeSVG(name, title, "冲突率 p", "平均延迟(模拟µs)",
		0.005, 1.0, []float64{0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1},
		ptsOpt, ptsPes, labels, pStar)
	fmt.Printf("%s 已写出(交叉点 p*=%.3f)。\n", name, pStar)
}

// ---------- mode=storm ----------

type stormCfg struct {
	gap time.Duration // 读→写窗口 / 悲观持锁时间
	kSet []int
	runs int
}

func runStorm(c stormCfg) {
	fmt.Println("== mode=storm: 热行秒杀, 事件交错模拟(真实 goroutine + 原子版本号) ==")
	fmt.Printf("== gap(读→写窗口/持锁)=%s  ==\n", c.gap)
	fmt.Println("== 每次成功提交使所有在途读者版本失效 → 乐观锁总尝试次数随并发度放大 ==")
	fmt.Printf("%-8s %-16s %-14s %-16s %-16s %-14s\n",
		"K并发", "乐观总尝试", "重试放大×", "乐观wall", "悲观wall", "悲观尝试")
	var csv *bufio.Writer
	if f, err := os.Create("storm.csv"); err == nil {
		csv = bufio.NewWriter(f)
		defer f.Close()     // 先注册 Close, 再注册 Flush → LIFO 保证 Flush 先执行
		defer csv.Flush()
		fmt.Fprintln(csv, "K,opt_attempts,opt_wall_us,pes_wall_us")
	}
	for _, k := range c.kSet {
		oAtt, oWall := stormOnce(k, c.gap, c.runs, true)
		pesAtt, pWall := stormOnce(k, c.gap, c.runs, false)
		amp := float64(oAtt) / float64(k)
		fmt.Printf("%-8d %-16d %-14.1f %-16s %-16s %-14d\n",
			k, oAtt, amp, fmtDur(oWall), fmtDur(pWall), pesAtt)
		if csv != nil {
			fmt.Fprintf(csv, "%d,%d,%.1f,%.1f\n", k, oAtt, oWall, pWall)
		}
	}
	if csv != nil {
		csv.Flush() // 先把缓冲的 CSV 行落盘, writeStormSVG 要重读它
		fmt.Println("\nstorm.csv 已写出。")
	}
	writeStormSVG()
}

// stormOnce 跑一轮热行竞争: K 个 goroutine 各做一次"成功递增版本号"。
// optimistic=true  用原子 CAS 重试(乐观锁);  false 用互斥锁(悲观锁)。
// 返回: 总尝试次数, 一轮 wall 时间 µs。
func stormOnce(k int, gap time.Duration, runs int, optimistic bool) (int, float64) {
	var best float64 = math.MaxFloat64
	totalAttempts := 0
	for run := 0; run < runs; run++ {
		barrier := make(chan struct{})
		var ver int64
		var mu sync.Mutex
		var attempts int64
		var wg sync.WaitGroup
		start := time.Now()
		for i := 0; i < k; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-barrier
				if optimistic {
					for {
						atomic.AddInt64(&attempts, 1)
						v := atomic.LoadInt64(&ver)
						time.Sleep(gap) // 读→写窗口, 模拟"读了版本号到写回之间"的网络间隙
						if atomic.CompareAndSwapInt64(&ver, v, v+1) {
							return // 版本号一致, 更新成功
						}
						// 版本号已变 → 冲突, 重试(携带新版本号再读一次)
					}
				} else {
					atomic.AddInt64(&attempts, 1)
					mu.Lock()
					v := atomic.LoadInt64(&ver)
					time.Sleep(gap) // 持锁期间读→写
					atomic.StoreInt64(&ver, v+1)
					mu.Unlock()
				}
			}()
		}
		close(barrier)
		wg.Wait()
		el := float64(time.Since(start).Microseconds())
		if el < best {
			best = el
		}
		totalAttempts += int(atomic.LoadInt64(&attempts))
	}
	return totalAttempts / runs, best
}

func writeStormSVG() {
	// 用 storm.csv 重绘: 尝试次数 vs 并发度
	f, err := os.Open("storm.csv")
	if err != nil {
		return
	}
	defer f.Close()
	var xs, ys []float64
	sc := bufio.NewScanner(f)
	sc.Scan() // header
	for sc.Scan() {
		var k, a, _, _ float64
		fmt.Sscanf(sc.Text(), "%f,%f,%f,%f", &k, &a, new(float64), new(float64))
		xs = append(xs, k)
		ys = append(ys, a)
	}
	if len(xs) == 0 {
		return
	}
	pes := make([][2]float64, len(xs))
	for i := range xs {
		pes[i] = [2]float64{xs[i], xs[i]} // 悲观: 尝试次数 = K
	}
	opt := make([][2]float64, len(xs))
	for i := range xs {
		opt[i] = [2]float64{xs[i], ys[i]}
	}
	writeSVG("storm.svg", "热行秒杀: 乐观锁重试放大 vs 悲观锁零浪费",
		"并发度 K", "总尝试次数",
		2, 256, []float64{2, 4, 8, 16, 32, 64, 128, 256},
		opt, pes, []string{"乐观(重试风暴)", "悲观(排队,尝试=K)"}, 0)
	fmt.Println("storm.svg 已写出。")
}

// ---------- 入口 ----------

func main() {
	mode := flag.String("mode", "sweep", "sweep(受控冲突率对照) | storm(热行重试风暴)")
	a := flag.Float64("a", defAttempt, "乐观锁单次尝试成本 µs")
	s := flag.Float64("s", defHold, "悲观锁持锁服务时间 µs")
	samples := flag.Int("samples", 200000, "sweep 公式验证抽样次数")
	gap := flag.Duration("gap", 200*time.Microsecond, "storm 读→写窗口/持锁时间")
	kMax := flag.Int("k", 128, "storm 最大并发度")
	runs := flag.Int("runs", 5, "storm 重复轮数")
	flag.Parse()

	switch *mode {
	case "sweep":
		runSweep(sweepCfg{
			a:       *a,
			s:       *s,
			pSet:    []float64{0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 0.95},
			nSet:    []int{2, 5, 10, 20, 50, 100},
			samples: *samples,
		})
	case "storm":
		var ks []int
		for k := 2; k <= *kMax; k *= 2 {
			ks = append(ks, k)
		}
		runStorm(stormCfg{gap: *gap, kSet: ks, runs: *runs})
	default:
		fmt.Fprintln(os.Stderr, "未知 mode:", *mode)
		os.Exit(2)
	}
}

// ---------- 极简 SVG 折线图(无第三方依赖) ----------

type pt = [2]float64

// writeSVG 画两条折线 + 可选交叉点竖线标记。x 轴对数化, 范围与刻度由调用方给定。
func writeSVG(name, title, xLabel, yLabel string, xlo, xhi float64, xticks []float64, opt, pes []pt, labels []string, pStar float64) {
	W, H := 760.0, 460.0
	ml, mr, mt, mb := 70.0, 24.0, 40.0, 48.0
	xmin, xmax := xlo, xhi // x 轴: log 空间 [xmin, xmax]
	pxlog := func(x float64) float64 {
		return ml + (W-ml-mr)*(math.Log(x)-math.Log(xmin))/(math.Log(xmax)-math.Log(xmin))
	}
	var maxY float64
	for _, ser := range [][]pt{opt, pes} {
		for _, p := range ser {
			if p[1] > maxY {
				maxY = p[1]
			}
		}
	}
	ymin, ymax := 1.0, maxY*1.08
	ylog := func(y float64) float64 {
		return (math.Log(y) - math.Log(ymin)) / (math.Log(ymax) - math.Log(ymin))
	}
	py := func(y float64) float64 { return mt + (H-mt-mb)*(1-ylog(y)) }

	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="Menlo,monospace" font-size="12">`, int(W), int(H), int(W), int(H))
	fmt.Fprintf(&b, `<rect x="0" y="0" width="%d" height="%d" fill="#ffffff"/><rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="#fafafa" stroke="#ccc"/>`,
		int(W), int(H), ml, mt, W-ml-mr, H-mt-mb)
	// 网格 + y 刻度(对数)
	for _, t := range []float64{1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000} {
		if t < ymin || t > ymax {
			continue
		}
		yy := py(t)
		fmt.Fprintf(&b, `<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#eee"/><text x="%.0f" y="%.0f" text-anchor="end">%d</text>`,
			ml, yy, W-mr, yy, ml-6, yy+4, int(t))
	}
	// x 刻度(对数)
	for _, t := range xticks {
		if t < xmin || t > xmax {
			continue
		}
		xx := pxlog(t)
		fmt.Fprintf(&b, `<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#eee"/><text x="%.0f" y="%.0f" text-anchor="middle">%g</text>`,
			xx, mt, xx, H-mb, xx, H-mb+18, t)
	}
	drawLine := func(pts []pt, col string) {
		s := ""
		for i, p := range pts {
			x, y := pxlog(p[0]), py(p[1])
			if i == 0 {
				s = fmt.Sprintf("M%.1f %.1f", x, y)
			} else {
				s += fmt.Sprintf(" L%.1f %.1f", x, y)
			}
		}
		fmt.Fprintf(&b, `<path d="%s" fill="none" stroke="%s" stroke-width="2.5"/>`, s, col)
	}
	drawLine(opt, "#d62728")
	drawLine(pes, "#1f77b4")
	for i, lab := range labels {
		col := "#d62728"
		if i == 1 {
			col = "#1f77b4"
		}
		fmt.Fprintf(&b, `<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="%s" stroke-width="2.5"/><text x="%.0f" y="%.0f">%s</text>`,
			ml+10, mt+16+float64(i)*20, ml+40, mt+16+float64(i)*20, col, ml+46, mt+20+float64(i)*20, lab)
	}
	if pStar > 0 && pStar < 1 {
		x := pxlog(pStar)
		fmt.Fprintf(&b, `<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#666" stroke-dasharray="4,3"/><text x="%.0f" y="%.0f" fill="#666">p*=%.3f</text>`,
			x, mt, x, H-mb, x+6, mt-6, pStar)
	}
	fmt.Fprintf(&b, `<text x="%.0f" y="20" font-size="14" font-weight="bold">%s</text>`, ml, title)
	fmt.Fprintf(&b, `<text x="%.0f" y="%.0f" text-anchor="middle" font-size="13">%s</text>`, ml+(W-ml-mr)/2, H-6, xLabel)
	fmt.Fprintf(&b, `<text x="18" y="%.0f" font-size="13" transform="rotate(-90 18 %.0f)" text-anchor="middle">%s</text>`, (mt+H-mb)/2, (mt+H-mb)/2, yLabel)
	fmt.Fprintf(&b, `</svg>`)
	os.WriteFile(name, []byte(b.String()), 0o644)
}
