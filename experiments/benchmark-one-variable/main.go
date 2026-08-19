// benchmark 只改一个变量的演示:
// 同一个工作负载(排序+分配), 只变化一个维度:
// - clean: 预热 + 无 GC 压力
// - noWarmup: 不预热(只改一个变量)
// - withGc: 预热 + 叠加 GC 压力(同时改了两个变量)
// 真实对比要在同一进程内交替跑才能暴露"第二个变量"的污染,
// 这里分开进程演示: 单独看每个数值时看不出问题, 放一起才看出 noWarmup/withGc
// 都被第二个变量(冷启动分配器 / GC 堆压力)污染。
package main

import (
	"flag"
	"fmt"
	"runtime"
	"sort"
	"time"
)

var sink []int

func work(n int) time.Duration {
	data := make([]int, n)
	for i := range data {
		data[i] = n - i
	}
	start := time.Now()
	sort.Ints(data)
	// 模拟业务分配: 每轮分配 8MB 并让其死亡
	dead := make([][]byte, 0, 64)
	for i := 0; i < 8; i++ {
		dead = append(dead, make([]byte, 1<<20))
	}
	_ = dead
	el := time.Since(start)
	sink = data[:1]
	return el
}

func main() {
	mode := flag.String("mode", "clean", "clean|noWarmup|withGc")
	flag.Parse()

	if *mode != "noWarmup" {
		for i := 0; i < 3; i++ {
			work(1_000_000)
		}
	}

	if *mode == "withGc" {
		runtime.GC()
		// 制造滞留 256MB: 提升堆水位, GC 更频繁
		keep := make([][]byte, 0, 256)
		for i := 0; i < 256; i++ {
			keep = append(keep, make([]byte, 1<<20))
		}
		sink = []int{len(keep)}
	}

	var durs []time.Duration
	for i := 0; i < 5; i++ {
		durs = append(durs, work(1_000_000))
	}
	min := durs[0]
	for _, d := range durs[1:] {
		if d < min {
			min = d
		}
	}
	fmt.Printf("mode=%-9s 5次: %v %v %v %v %v  min=%v\n", *mode,
		durs[0], durs[1], durs[2], durs[3], durs[4], min)
}