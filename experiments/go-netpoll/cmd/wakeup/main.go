// Command wakeup measures the two claims of the netpoll article:
//
//  1. N goroutines blocked reading a socket do NOT consume OS threads:
//     the runtime parks the G and frees the M, so OS thread count stays
//     near GOMAXPROCS regardless of how many goroutines are waiting.
//  2. Event -> wakeup latency: how long from the moment a writer syscall
//     delivers a byte until the blocked reader goroutine observes it.
//
// Run (raise the fd limit first; each connection is 2 fds):
//
//	ulimit -n 30000
//	go run ./go-netpoll/cmd/wakeup -n 10000 -rounds 3
//	go run ./go-netpoll/cmd/wakeup -n 1 -rounds 20000 -settle 500us   # isolated wakeup cost
package main

import (
	"flag"
	"fmt"
	"net"
	"runtime"
	"runtime/metrics"
	"sort"
	"sync/atomic"
	"time"
)

// slot holds one TCP pair. reader is the accepted (server) end; the reader
// goroutine blocks in reader.Read. writer is the dialed (client) end; the
// event loop writes here so the byte travels client->server and actually
// reaches the parked reader. (Writing on the same end you read from never
// wakes the reader: TCP data flows one direction per connection.)
type slot struct {
	reader   net.Conn
	writer   net.Conn
	lastSent atomic.Int64 // unix-ns the pending byte was handed to the kernel (0 = consumed)
}

var (
	n       = flag.Int("n", 10000, "number of goroutines blocked reading a socket")
	rounds  = flag.Int("rounds", 3, "rounds of write-to-all-conns; one latency sample per conn per round")
	settle  = flag.Duration("settle", 200*time.Microsecond, "writer pause between rounds so readers re-park")
	settleI = flag.Duration("init-sleep", 300*time.Millisecond, "pause after readers start before measuring threads")
)

func threads() int {
	s := []metrics.Sample{{Name: "/sched/gomaxprocs:threads"}}
	metrics.Read(s)
	return int(s[0].Value.Uint64())
}

func main() {
	flag.Parse()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	defer ln.Close()

	slots := make([]*slot, *n)
	var started atomic.Int64
	latencies := make([]time.Duration, *n**rounds)

	// Each goroutine blocks in conn.Read (pollable fd -> netpoll park).
	for i := 0; i < *n; i++ {
		c, err := net.Dial("tcp", ln.Addr().String())
		if err != nil {
			panic(err)
		}
		s, err := ln.Accept()
		if err != nil {
			panic(err)
		}
		slots[i] = &slot{reader: s, writer: c}
		go func(i int) {
			defer slots[i].reader.Close()
			defer slots[i].writer.Close()
			started.Add(1)
			buf := make([]byte, 1)
			for r := 0; r < *rounds; r++ {
				if _, err := slots[i].reader.Read(buf); err != nil {
					return
				}
				if sent := slots[i].lastSent.Load(); sent != 0 {
					latencies[i**rounds+r] = time.Since(time.Unix(0, sent))
				}
				slots[i].lastSent.Store(0)
			}
		}(i)
	}

	// Wait until every goroutine has started its read, then let them park.
	for started.Load() != int64(*n) {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(*settleI)

	gcount := runtime.NumGoroutine()
	thr := threads()
	fmt.Printf("mode=netpoll  GOMAXPROCS=%d  goroutines=%d  OS threads=%d\n",
		runtime.GOMAXPROCS(0), gcount, thr)
	fmt.Printf("  %d goroutines blocked in socket Read -> %d threads (baseline busy threads near GOMAXPROCS)\n\n",
		*n, thr)

	// Event -> wakeup latency: writer stores ts, writes 1 byte, reader records delta.
	done := make(chan struct{})
	go func() {
		buf := []byte{1}
		for r := 0; r < *rounds; r++ {
			for i := 0; i < *n; i++ {
				slots[i].lastSent.Store(time.Now().UnixNano())
				if _, err := slots[i].writer.Write(buf); err != nil {
					return
				}
			}
			time.Sleep(*settle)
		}
		close(done)
	}()
	<-done
	// Give slow readers a moment to finish their last sample.
	time.Sleep(50 * time.Millisecond)

	report := latencies[:0]
	for _, d := range latencies {
		if d > 0 {
			report = append(report, d)
		}
	}
	sort.Slice(report, func(i, j int) bool { return report[i] < report[j] })
	if len(report) == 0 {
		fmt.Println("no latency samples collected (readers never woke? check fd limit)")
		return
	}
	p := func(q float64) time.Duration { return report[int(float64(len(report)-1)*q)] }
	fmt.Printf("event->wakeup latency over %d samples:\n", len(report))
	fmt.Printf("  p50=%s  p90=%s  p99=%s  max=%s\n", p(0.50), p(0.90), p(0.99), report[len(report)-1])
}
