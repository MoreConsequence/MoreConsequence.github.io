package main

import (
	"flag"
	"fmt"
	"runtime"
)

// item deliberately contains pointers: the benchmark is about mark scanning,
// not about the cost of allocating a pointer-free byte buffer.
type item struct {
	left  *item
	right *item
	next  *item
}

func main() {
	n := flag.Int("n", 1_000_000, "number of pointer-rich objects to retain")
	flag.Parse()

	items := make([]*item, 0, *n)
	var previous *item
	for i := 0; i < *n; i++ {
		current := &item{
			left:  previous,
			right: previous,
			next:  previous,
		}
		items = append(items, current)
		previous = current
	}

	// Keep the live graph reachable until after the runtime has observed it.
	runtime.KeepAlive(items)
	fmt.Printf("objects=%d gomaxprocs=%d\n", len(items), runtime.GOMAXPROCS(0))
}
