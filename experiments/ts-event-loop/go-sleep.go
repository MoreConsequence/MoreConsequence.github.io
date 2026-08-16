package main

import (
	"fmt"
	"runtime"
	"sync"
	"time"
)

func main() {
	runtime.GOMAXPROCS(1)
	start := time.Now()
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		time.Sleep(50 * time.Millisecond)
		fmt.Printf("50ms goroutine finished at %v\n", time.Since(start).Round(time.Millisecond))
	}()
	go func() {
		defer wg.Done()
		time.Sleep(10 * time.Millisecond)
		fmt.Printf("10ms goroutine finished at %v\n", time.Since(start).Round(time.Millisecond))
	}()
	wg.Wait()
}
