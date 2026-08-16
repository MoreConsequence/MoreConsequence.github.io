package main

import (
	"flag"
	"fmt"
	"runtime"
)

func makeRetained(total, keep, width int) [][]byte {
	all := make([][]byte, 0, total)
	for i := 0; i < total; i++ {
		all = append(all, make([]byte, width))
	}
	return all[:keep]
}

func makeCopied(total, keep, width int) [][]byte {
	all := make([][]byte, 0, total)
	for i := 0; i < total; i++ {
		all = append(all, make([]byte, width))
	}
	return append([][]byte(nil), all[:keep]...)
}

func main() {
	mode := flag.String("mode", "retained", "retained or copied")
	total := flag.Int("total", 64*1024, "number of byte slices")
	keep := flag.Int("keep", 10, "number of slices returned")
	width := flag.Int("width", 1024, "bytes per slice")
	flag.Parse()

	var result [][]byte
	switch *mode {
	case "retained":
		result = makeRetained(*total, *keep, *width)
	case "copied":
		result = makeCopied(*total, *keep, *width)
	default:
		panic("mode must be retained or copied")
	}

	runtime.GC()
	var stats runtime.MemStats
	runtime.ReadMemStats(&stats)
	runtime.KeepAlive(result)
	fmt.Printf("mode=%s total=%d keep=%d width=%d heap_alloc=%d len=%d cap=%d\n", *mode, *total, *keep, *width, stats.HeapAlloc, len(result), cap(result))
}
