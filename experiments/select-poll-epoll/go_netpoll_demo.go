package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"runtime"
	"sync"
	"time"
)

type readResult struct {
	err     error
	readFor time.Duration
}

func main() {
	count := flag.Int("n", 32, "number of TCP connections")
	settle := flag.Duration("settle", 100*time.Millisecond, "time to leave readers parked")
	flag.Parse()
	if *count < 1 {
		log.Fatal("-n must be positive")
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()

	ready := make(chan struct{}, *count)
	results := make(chan readResult, *count)
	clients := make([]net.Conn, 0, *count)
	var serverWG sync.WaitGroup
	serverWG.Add(1)

	go func() {
		defer serverWG.Done()
		for i := 0; i < *count; i++ {
			conn, err := listener.Accept()
			if err != nil {
				results <- readResult{err: fmt.Errorf("accept %d: %w", i, err)}
				return
			}

			serverWG.Add(1)
			go func(conn net.Conn) {
				defer serverWG.Done()
				defer conn.Close()

				ready <- struct{}{}
				started := time.Now()
				var one [1]byte
				_, err := io.ReadFull(conn, one[:])
				readFor := time.Since(started)
				if err == nil {
					_, err = conn.Write(one[:])
				}
				results <- readResult{err: err, readFor: readFor}
			}(conn)
		}
	}()

	for i := 0; i < *count; i++ {
		conn, err := net.Dial("tcp", listener.Addr().String())
		if err != nil {
			log.Fatal(err)
		}
		clients = append(clients, conn)
	}

	for i := 0; i < *count; i++ {
		<-ready
	}

	fmt.Printf("phase=parked connections=%d goroutines=%d gomaxprocs=%d\n",
		*count, runtime.NumGoroutine(), runtime.GOMAXPROCS(0))
	time.Sleep(*settle)

	releaseAt := time.Now()
	for i, conn := range clients {
		if _, err := conn.Write([]byte{byte(i)}); err != nil {
			log.Fatal(err)
		}
	}

	for _, conn := range clients {
		var echo [1]byte
		if _, err := io.ReadFull(conn, echo[:]); err != nil {
			log.Fatal(err)
		}
		_ = conn.Close()
	}

	successes := 0
	var firstRead, lastRead time.Duration
	for i := 0; i < *count; i++ {
		result := <-results
		if result.err != nil {
			log.Fatal(result.err)
		}
		if successes == 0 || result.readFor < firstRead {
			firstRead = result.readFor
		}
		if result.readFor > lastRead {
			lastRead = result.readFor
		}
		successes++
	}
	serverWG.Wait()

	fmt.Printf("phase=released connections=%d successes=%d release_to_done=%s first_read=%s last_read=%s\n",
		*count, successes, time.Since(releaseAt), firstRead, lastRead)
}
