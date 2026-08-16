package main

import (
	"flag"
	"fmt"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

var resultSink int

//go:noinline
func descend(depth int) int {
	if depth == 0 {
		return 1
	}
	return descend(depth-1) + 1
}

func measure(depth int) int64 {
	done := make(chan int64, 1)
	go func() {
		start := time.Now()
		result := descend(depth)
		resultSink = result
		runtime.KeepAlive(result)
		done <- time.Since(start).Nanoseconds()
	}()
	return <-done
}

func median(samples []int64) int64 {
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
	return samples[len(samples)/2]
}

func main() {
	depthsFlag := flag.String("depths", "1000,100000,1000000", "comma-separated recursion depths")
	repeats := flag.Int("repeats", 5, "fresh goroutines per depth")
	flag.Parse()
	if *repeats < 1 {
		panic("repeats must be positive")
	}

	for _, rawDepth := range strings.Split(*depthsFlag, ",") {
		depth, err := strconv.Atoi(strings.TrimSpace(rawDepth))
		if err != nil || depth < 0 {
			panic(fmt.Sprintf("invalid depth %q", rawDepth))
		}
		samples := make([]int64, *repeats)
		for i := range samples {
			samples[i] = measure(depth)
		}
		m := median(samples)
		fmt.Printf("depth=%d repeats=%d samples_ns=%v median_ns=%d per_level_ns=%.4f\n",
			depth, *repeats, samples, m, float64(m)/float64(max(depth, 1)))
	}
}
