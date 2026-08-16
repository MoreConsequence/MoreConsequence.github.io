package main

import (
	"flag"
	"fmt"
)

func main() {
	n := flag.Int("n", 1_000_000, "number of ready select iterations")
	flag.Parse()

	left := make(chan struct{}, 1)
	right := make(chan struct{}, 1)
	left <- struct{}{}
	right <- struct{}{}

	leftCount, rightCount := 0, 0
	for i := 0; i < *n; i++ {
		select {
		case <-left:
			leftCount++
			left <- struct{}{}
		case <-right:
			rightCount++
			right <- struct{}{}
		}
	}

	leftRatio := float64(leftCount) / float64(*n)
	rightRatio := float64(rightCount) / float64(*n)
	fmt.Printf("iterations=%d left=%d right=%d left_ratio=%.6f right_ratio=%.6f\n", *n, leftCount, rightCount, leftRatio, rightRatio)
}
