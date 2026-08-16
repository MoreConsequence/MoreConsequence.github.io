// rule-match-sim.go — 模拟 iptables 线性匹配 vs IPVS 哈希直查的“匹配步数”
//
// 对应博客《Service 不是转发是线性遍历》的抽象模型，回答一个问题：
// 一个包从集群外打到某个 ClusterIP，内核在 datapath 里要“看”多少条规则？
//
// iptables 模式（kube-proxy 默认）：
//   - KUBE-SERVICES 链里每个 Service 一条规则（匹配 dst ClusterIP:port），
//     逐条匹配、命中即跳转，平均要遍历 N/2 条；
//   - 命中后跳进该 Service 的 KUBE-SVC-* 链，链内每 Endpoint 一条 statistic 规则，
//     再平均遍历 E/2 条做 DNAT 选路。
//
// IPVS 模式：
//   - 内核按 (proto, addr, port) 哈希查服务表，O(1)，与规则规模无关。
//
// 用法：cd experiments/k8s-svc-net && go run rule-match-sim.go
// 注意：这是“规则匹配次数”的抽象模型，不是内核真实 datapath；
// 步数是推导结果，ns 计时是本机一次结果（绝对值随机器/内核版本变化），
// 关注“步数随 N 线性增长、哈希版恒为常数”的相对形状。
package main

import (
	"fmt"
	"math/rand"
	"time"
)

func main() {
	rng := rand.New(rand.NewSource(42))
	endpoints := 4 // 每个 Service 4 个 Endpoint，可改

	// 模拟一次 iptables 匹配：线性扫描 KUBE-SERVICES，命中返回遍历条数。
	matchLinear := func(svcRules []int, dst int) int {
		steps := 0
		for _, r := range svcRules {
			steps++
			if r == dst {
				return steps
			}
		}
		return steps
	}

	fmt.Printf("模型参数：每 Service %d 个 Endpoint\n", endpoints)
	fmt.Printf("N(Service)  iptables规则总数  平均匹配步数(iptables)  哈希直查步数(IPVS)\n")
	for _, n := range []int{10, 100, 1000, 5000, 10000} {
		svcRules := make([]int, n) // KUBE-SERVICES：第 i 条规则匹配第 i 个 Service
		for i := range svcRules {
			svcRules[i] = i
		}
		hash := make(map[int]struct{}, n) // IPVS 服务表：哈希直查
		for i := 0; i < n; i++ {
			hash[i] = struct{}{}
		}

		const pkts = 1_000_000
		iptSteps := 0
		for p := 0; p < pkts; p++ {
			dst := rng.Intn(n)
			iptSteps += matchLinear(svcRules, dst) // 外层 Service 链
			iptSteps += endpoints / 2              // 内层 Endpoint 链，平均 E/2
			_, _ = hash[dst]                       // IPVS 查表，常数
		}
		rulesTotal := n + n*endpoints // KUBE-SERVICES n 条 + 每 Service 内 endpoints 条
		fmt.Printf("%6d  %9d  %18.1f  %12d\n",
			n, rulesTotal, float64(iptSteps)/pkts, 1)
	}

	// 计时：本机一次结果，只看相对形状（线性 vs 常数）。
	timeLinear := func(n, iters int) time.Duration {
		svcRules := make([]int, n)
		for i := range svcRules {
			svcRules[i] = i
		}
		start := time.Now()
		for i := 0; i < iters; i++ {
			matchLinear(svcRules, rng.Intn(n))
		}
		return time.Since(start)
	}
	timeHash := func(n, iters int) time.Duration {
		hash := make(map[int]struct{}, n)
		for i := 0; i < n; i++ {
			hash[i] = struct{}{}
		}
		start := time.Now()
		for i := 0; i < iters; i++ {
			_, _ = hash[rng.Intn(n)]
		}
		return time.Since(start)
	}
	fmt.Println("\n计时（本机一次结果，ns/包；只可比相对形状，不可当生产结论）:")
	const iters = 5_000_000
	for _, n := range []int{1000, 10000} {
		fmt.Printf("N=%6d  iptables=%8.0f ns/包  IPVS哈希=%8.0f ns/包\n",
			n,
			float64(timeLinear(n, iters)/time.Duration(iters)),
			float64(timeHash(n, iters)/time.Duration(iters)))
	}
}
