package main

import (
	"flag"
	"fmt"
	"runtime"
	"sync"
)

type snapshot struct {
	heapAlloc  uint64
	heapObject uint64
	goroutines int
}

func readSnapshot() snapshot {
	runtime.GC()
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	return snapshot{
		heapAlloc:  memory.HeapAlloc,
		heapObject: memory.HeapObjects,
		goroutines: runtime.NumGoroutine(),
	}
}

func main() {
	chunks := flag.Int("chunks", 32, "retained byte slices")
	chunkBytes := flag.Int("chunk-bytes", 64*1024, "bytes per retained slice")
	stuck := flag.Int("stuck", 100, "goroutines blocked on receive")
	flag.Parse()
	if *chunks < 1 || *chunkBytes < 1 || *stuck < 1 {
		panic("all sizes must be positive")
	}

	before := readSnapshot()
	store := make([][]byte, 0, *chunks)
	for i := 0; i < *chunks; i++ {
		buffer := make([]byte, *chunkBytes)
		for index := range buffer {
			buffer[index] = byte(i)
		}
		store = append(store, buffer)
	}

	blocked := make(chan struct{})
	ready := make(chan struct{}, *stuck)
	var wait sync.WaitGroup
	wait.Add(*stuck)
	for i := 0; i < *stuck; i++ {
		go func() {
			defer wait.Done()
			ready <- struct{}{}
			<-blocked
		}()
	}
	for i := 0; i < *stuck; i++ {
		<-ready
	}
	after := readSnapshot()
	// Keep the retained buffers live until after the measurements.
	runtime.KeepAlive(store)

	fmt.Printf(
		"go=%s chunks=%d chunk_bytes=%d retained_bytes=%d stuck=%d\n",
		runtime.Version(), *chunks, *chunkBytes, *chunks**chunkBytes, *stuck,
	)
	fmt.Printf(
		"heap_alloc_before=%d heap_alloc_after=%d heap_delta=%d objects_before=%d objects_after=%d goroutines_before=%d goroutines_after=%d\n",
		before.heapAlloc,
		after.heapAlloc,
		after.heapAlloc-before.heapAlloc,
		before.heapObject,
		after.heapObject,
		before.goroutines,
		after.goroutines,
	)
	_ = wait
}
