// 限流算法对照：流量恰好跨窗口边界时，固定窗口 / 滑动窗口 / 令牌桶各放行多少
//
// 场景：limit=100/s。t=990ms 均匀来 100 个请求，t=1000ms（窗口边界）再均匀来 100 个。
// 固定窗口：990 归窗口0，1000 归窗口1 → 理论放 200（穿透翻倍）。
// 滑动窗口：1000ms 时窗口覆盖 [0,1000]，990 的请求仍在窗内 → 最多放 100。
// 令牌桶：990 用光 100 令牌，到 1000 只补了 ~1 个 → 几乎全部拒绝，但 1s 后自然恢复。
package main

import (
	"fmt"
	"math/rand"
	"time"
)

const (
	windowMs = 1000
	limit    = 100
	burst    = 100
	rate     = 100
)

func gen(seed int64) []time.Duration {
	r := rand.New(rand.NewSource(seed))
	var ts []time.Duration
	for i := 0; i < limit; i++ {
		ts = append(ts, time.Duration(990)*time.Millisecond+time.Duration(r.Intn(10))*time.Millisecond)
	}
	for i := 0; i < limit; i++ {
		ts = append(ts, time.Duration(1000)*time.Millisecond+time.Duration(r.Intn(10))*time.Millisecond)
	}
	return ts
}

func fixedWindow(ts []time.Duration) int {
	wc := map[int64]int{}
	passed := 0
	for _, t := range ts {
		w := t.Milliseconds() / windowMs
		if wc[w] < limit {
			wc[w]++
			passed++
		}
	}
	return passed
}

func slidingWindow(ts []time.Duration) int {
	passed := 0
	for pos, t := range ts {
		cnt := 0
		for j := 0; j < pos; j++ {
			if t-ts[j] < windowMs*time.Millisecond {
				cnt++
			}
		}
		if cnt < limit {
			passed++
		}
	}
	return passed
}

func tokenBucket(ts []time.Duration) int {
	tokens := float64(burst)
	var last time.Duration
	passed := 0
	for _, t := range ts {
		tokens += rate * float64(t-last) / float64(time.Second)
		if tokens > float64(burst) {
			tokens = float64(burst)
		}
		if tokens >= 1 {
			tokens--
			passed++
		}
		last = t
	}
	return passed
}

func main() {
	fmt.Printf("场景：limit=%d/s，990ms 与 1000ms（窗口边界）各来 %d 个请求\n\n", limit, limit)
	for _, seed := range []int64{42, 7, 2026} {
		ts := gen(seed)
		fmt.Printf("seed=%d  固定窗口放行 %d   滑动窗口放行 %d   令牌桶放行 %d\n",
			seed, fixedWindow(ts), slidingWindow(ts), tokenBucket(ts))
	}
}
