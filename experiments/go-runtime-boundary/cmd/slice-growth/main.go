package main

import (
	"flag"
	"fmt"
)

// This probe counts the old elements that a real append must copy whenever
// the runtime grows the backing array. It is a version-bound observation, not
// a reimplementation of runtime.growslice.
func main() {
	limit := flag.Int("limit", 1_000_000, "number of elements to append")
	flag.Parse()
	if *limit < 1 {
		panic("limit must be positive")
	}

	values := make([]int, 0)
	var expansions int
	var copiedElements int64
	for len(values) < *limit {
		oldLen, oldCap := len(values), cap(values)
		values = append(values, 0)
		if cap(values) != oldCap {
			expansions++
			copiedElements += int64(oldLen)
		}
	}

	fmt.Printf(
		"limit=%d final_len=%d final_cap=%d expansions=%d copied_elements=%d copied_over_final_cap=%.6f\n",
		*limit,
		len(values),
		cap(values),
		expansions,
		copiedElements,
		float64(copiedElements)/float64(cap(values)),
	)
}
