package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// bench drives an http.Transport against the local upstream server and reports
// the one number that matters for this article: how many brand-new TCP
// connections the Transport had to dial (the "reuse tax"), plus throughput and
// latency. Default pool vs tuned pool is chosen purely with flags.
func main() {
	var workers, requests, warmup int
	var perHost, maxIdle, maxConns int
	var idleTimeout time.Duration
	var url, statsURL string
	flag.IntVar(&workers, "workers", 50, "concurrent workers")
	flag.IntVar(&requests, "requests", 300, "sequential requests per worker")
	flag.IntVar(&warmup, "warmup", 200, "requests to run (1 goroutine) before measuring")
	flag.IntVar(&perHost, "perhost", 2, "MaxIdleConnsPerHost (2 = default)")
	flag.IntVar(&maxIdle, "maxidle", 100, "MaxIdleConns (100 = default)")
	flag.IntVar(&maxConns, "maxconns", 0, "MaxConnsPerHost (0 = no limit)")
	flag.DurationVar(&idleTimeout, "idle-timeout", 90*time.Second, "IdleConnTimeout (90s = default)")
	flag.StringVar(&url, "url", "http://127.0.0.1:18765/", "server URL")
	flag.StringVar(&statsURL, "stats", "http://127.0.0.1:18766/stats", "server /stats URL (not counted)")
	flag.Parse()

	// Count every new TCP connection the Transport dials: this is exactly the
	// per-request handshake work paid when the idle pool misses.
	var dials atomic.Int64
	transport := &http.Transport{
		MaxIdleConns:          maxIdle,
		MaxIdleConnsPerHost:   perHost,
		MaxConnsPerHost:       maxConns,
		IdleConnTimeout:       idleTimeout,
		ForceAttemptHTTP2:     false, // plain http://, HTTP/1.1 keep-alive
		DisableKeepAlives:     false,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			dials.Add(1)
			return (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext(ctx, network, addr)
		},
	}
	client := &http.Client{Transport: transport}

	// Warm the pool up first so the tuned run isn't charged for its initial
	// 50 dials. Default pool caps at 2 idle conns regardless of warmup length.
	for i := 0; i < warmup; i++ {
		doReq(client, url)
	}
	a0 := serverAccepts(statsURL)
	dials.Store(0)

	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		latency  []time.Duration
		totalReq int64
	)
	start := time.Now()
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < requests; j++ {
				t0 := time.Now()
				doReq(client, url)
				d := time.Since(t0)
				mu.Lock()
				latency = append(latency, d)
				totalReq++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	elapsed := time.Since(start)
	a1 := serverAccepts(statsURL)

	total := int64(workers) * int64(requests)
	var sum time.Duration
	for _, l := range latency {
		sum += l
	}
	sort.Slice(latency, func(i, j int) bool { return latency[i] < latency[j] })
	avg := sum / time.Duration(len(latency))
	p50 := latency[len(latency)*50/100]
	p99 := latency[len(latency)*99/100]

	d := dials.Load()
	fmt.Printf("workers=%d requests=%d\n", workers, requests)
	fmt.Printf("pool: MaxIdleConns=%d MaxIdleConnsPerHost=%d IdleConnTimeout=%v MaxConnsPerHost=%d\n",
		maxIdle, perHost, idleTimeout, maxConns)
	fmt.Printf("total requests: %d\n", total)
	fmt.Printf("new TCP connections dialed: %d  (reuse ratio = %.2f%% requests served without a new dial)\n",
		d, 100*float64(total-d)/float64(total))
	fmt.Printf("server-side accepts during run: %d\n", a1-a0)
	fmt.Printf("throughput: %.0f req/s\n", float64(total)/elapsed.Seconds())
	fmt.Printf("latency avg=%v p50=%v p99=%v\n", avg, p50, p99)
}

func doReq(client *http.Client, url string) {
	resp, err := client.Get(url)
	if err != nil {
		return
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
}

func serverAccepts(statsURL string) int64 {
	resp, err := http.Get(statsURL)
	if err != nil {
		return -1
	}
	defer resp.Body.Close()
	var st struct {
		Accepts int64 `json:"accepts"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&st)
	return st.Accepts
}
