// Command raw-syscall shows the other side of the pollable divide:
// goroutines blocked on a raw, blocking syscall.Read (bypassing the
// internal/poll netpoll wrapper) pin an OS thread. The runtime parks nothing:
// the M is stuck in the kernel read, so it cannot serve any other goroutine.
//
// Contrast with cmd/wakeup, where N goroutines blocked on a pollable socket
// stay parked via gopark and the OS thread count stays near GOMAXPROCS.
//
// Thread-count growth here is CONDITIONAL, not automatic. When a P is stuck
// in _Psyscall for >~10ms, sysmon's retake hands it to another M (see
// runtime/proc.go, handoffp) — but a replacement M is only started if the
// retaken P (or the global run queue) has runnable work. This command keeps a
// work producer running so that trigger exists. On Linux this reliably grows
// the OS thread count toward -n; on macOS the handoff cascade is
// timing-dependent and the count may plateau near GOMAXPROCS. The command
// reports GOMAXPROCS, the current count and the PEAK count over the sampling
// window; peak > GOMAXPROCS is the evidence that replacement Ms were spawned.
//
// Run:
//
//	go run ./go-netpoll/cmd/raw-syscall -n 64
package main

import (
	"flag"
	"fmt"
	"net"
	"runtime"
	"runtime/metrics"
	"sync/atomic"
	"syscall"
	"time"
)

var (
	n        = flag.Int("n", 64, "number of goroutines blocked in a raw syscall.Read")
	window   = flag.Duration("window", 3*time.Second, "how long to sample the OS thread count")
	producer = flag.Bool("producer", true, "run a goroutine-spawning producer (the documented trigger for replacement Ms)")
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

	clients := make([]net.Conn, 0, *n) // kept alive so the server-side reads never see EOF
	var started atomic.Int64
	for i := 0; i < *n; i++ {
		c, err := net.Dial("tcp", ln.Addr().String())
		if err != nil {
			panic(err)
		}
		clients = append(clients, c)
		s, err := ln.Accept()
		if err != nil {
			panic(err)
		}
		rc, ok := s.(*net.TCPConn)
		if !ok {
			panic("not a TCPConn")
		}
		fd, err := rc.SyscallConn()
		if err != nil {
			panic(err)
		}
		var rawFD int
		fd.Control(func(f uintptr) { rawFD = int(f) })
		// Make the fd blocking: a raw syscall.Read on it now pins the M.
		if err := syscall.SetNonblock(rawFD, false); err != nil {
			panic(err)
		}
		go func(fd int) {
			buf := make([]byte, 4096)
			started.Add(1)
			// Never returns until the conn is closed or data arrives.
			for {
				if _, err := syscall.Read(fd, buf); err != nil {
					return
				}
			}
		}(rawFD)
	}

	for started.Load() != int64(*n) {
		time.Sleep(time.Millisecond)
	}

	// Competing runnable work: without it, handoffp puts a retaken P straight
	// back on the idle list and no replacement M is spawned (see handoffp in
	// runtime/proc.go). With it, a retaken P has work to run and startm
	// creates a new OS thread, so the count can climb past GOMAXPROCS.
	var stopProducer chan struct{}
	if *producer {
		stopProducer = make(chan struct{})
		go func() {
			for {
				for i := 0; i < 2000; i++ {
					go func() {}()
				}
				select {
				case <-stopProducer:
					return
				default:
					time.Sleep(5 * time.Millisecond)
				}
			}
		}()
	}

	// Sample the OS thread count; report current, peak and GOMAXPROCS.
	base := runtime.GOMAXPROCS(0)
	peak := threads()
	t0 := time.Now()
	for time.Since(t0) < *window {
		time.Sleep(50 * time.Millisecond)
		if t := threads(); t > peak {
			peak = t
		}
	}
	if stopProducer != nil {
		close(stopProducer)
	}

	fmt.Printf("mode=raw-syscall  GOMAXPROCS=%d  goroutines=%d  OS threads(now)=%d  peak=%d\n",
		base, *n, threads(), peak)
	if peak > base {
		fmt.Printf("  peak %d > GOMAXPROCS %d: replacement Ms were spawned for the pinned syscall Ms\n", peak, base)
	} else {
		fmt.Printf("  peak stayed at GOMAXPROCS: the Ms are pinned but no replacement M was needed (macOS often plateaus here; see README)\n")
	}
	fmt.Printf("  each of the %d goroutines blocks inside a raw syscall.Read; that M cannot serve any other goroutine\n", *n)
}
