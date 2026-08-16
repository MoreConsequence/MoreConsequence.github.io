package netpoll

import (
	"net"
	"sync/atomic"
	"testing"
	"time"
)

// BenchmarkWakeupLatency measures the isolated event->wakeup cost for a
// single goroutine parked in netpoll on a pollable socket: the writer
// stores a timestamp, writes one byte, and busy-waits until the reader
// has consumed it (which also forces the reader to re-park between
// iterations). The delta recorded by the reader is the true wakeup path:
// kernel event -> epoll/kqueue -> netpoll -> injectglist -> schedule.
func BenchmarkWakeupLatency(b *testing.B) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		b.Fatal(err)
	}
	defer ln.Close()

	serverCh := make(chan net.Conn, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		serverCh <- c
	}()
	client, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		b.Fatal(err)
	}
	defer client.Close()
	server := <-serverCh
	defer server.Close()

	var (
		lastSent atomic.Int64 // unix-ns of the pending byte, 0 = consumed
		sumLat   atomic.Int64 // sum of wakeup deltas, ns
		wakeups  atomic.Int64
	)

	// Reader: blocked in Read, parks via netpoll when the buffer is empty.
	go func() {
		buf := make([]byte, 1)
		for {
			if _, err := server.Read(buf); err != nil {
				return
			}
			if sent := lastSent.Load(); sent != 0 {
				sumLat.Add(int64(time.Since(time.Unix(0, sent))))
				wakeups.Add(1)
			}
			lastSent.Store(0) // signal "consumed" to the writer
		}
	}()

	b.ResetTimer()
	payload := []byte{1}
	for i := 0; i < b.N; i++ {
		lastSent.Store(time.Now().UnixNano())
		if _, err := client.Write(payload); err != nil {
			b.Fatal(err)
		}
		// Wait for the reader to consume it; this is the wakeup latency.
		for lastSent.Load() != 0 {
		}
	}
	b.StopTimer()

	time.Sleep(10 * time.Millisecond) // let the last delta land
	n := wakeups.Load()
	if n == 0 {
		b.Skip("no wakeup samples recorded")
	}
	mean := time.Duration(sumLat.Load() / n)
	b.ReportMetric(mean.Seconds()*1e6, "wakeup-us/op")
	if n < int64(b.N)-2 {
		b.Logf("note: %d/%d samples recorded", n, b.N)
	}
}
