package main

import (
	"fmt"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
	"time"
	"unsafe"
)

// packed deliberately places both counters in the same 64-byte region.
// The experiment reports the layout instead of assuming that every CPU has
// the same cache-line size.
type packed struct {
	a int64
	b int64
}

// padded separates the counters by 64 bytes on the current target.
// A different cache-line size can make this padding insufficient or wasteful.
type padded struct {
	a int64
	_ [7]int64
	b int64
}

const (
	iterations  = 2_000_000
	repetitions = 7
)

func runPacked() time.Duration {
	var counters packed
	return run(func(worker int) {
		if worker == 0 {
			for i := 0; i < iterations; i++ {
				atomic.AddInt64(&counters.a, 1)
			}
			return
		}
		for i := 0; i < iterations; i++ {
			atomic.AddInt64(&counters.b, 1)
		}
	})
}

func runPadded() time.Duration {
	var counters padded
	return run(func(worker int) {
		if worker == 0 {
			for i := 0; i < iterations; i++ {
				atomic.AddInt64(&counters.a, 1)
			}
			return
		}
		for i := 0; i < iterations; i++ {
			atomic.AddInt64(&counters.b, 1)
		}
	})
}

func run(work func(worker int)) time.Duration {
	var start sync.WaitGroup
	var done sync.WaitGroup
	start.Add(1)
	done.Add(2)
	for worker := 0; worker < 2; worker++ {
		go func(worker int) {
			defer done.Done()
			start.Wait()
			work(worker)
		}(worker)
	}
	started := time.Now()
	start.Done()
	done.Wait()
	return time.Since(started)
}

func median(values []time.Duration) time.Duration {
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	return values[len(values)/2]
}

func measure(runCase func() time.Duration) time.Duration {
	// Warm up the code and scheduler before collecting the reported samples.
	_ = runCase()
	values := make([]time.Duration, 0, repetitions)
	for i := 0; i < repetitions; i++ {
		values = append(values, runCase())
	}
	return median(values)
}

func main() {
	runtime.GOMAXPROCS(2)
	var packedLayout packed
	var paddedLayout padded

	fmt.Printf("go=%s goos=%s goarch=%s gomaxprocs=%d\n", runtime.Version(), runtime.GOOS, runtime.GOARCH, runtime.GOMAXPROCS(0))
	fmt.Printf("cache_line_assumption=64 packed_size=%d packed_b_offset=%d padded_size=%d padded_b_offset=%d\n",
		unsafe.Sizeof(packedLayout), unsafe.Offsetof(packedLayout.b), unsafe.Sizeof(paddedLayout), unsafe.Offsetof(paddedLayout.b))
	fmt.Printf("workers=2 iterations=%d repetitions=%d warmup=1 operation=atomic.AddInt64\n", iterations, repetitions)

	packedMedian := measure(runPacked)
	paddedMedian := measure(runPadded)
	fmt.Printf("case=packed median_ns=%d\n", packedMedian.Nanoseconds())
	fmt.Printf("case=padded median_ns=%d\n", paddedMedian.Nanoseconds())
	if paddedMedian > 0 {
		fmt.Printf("ratio=%.2fx\n", float64(packedMedian)/float64(paddedMedian))
	}
}
