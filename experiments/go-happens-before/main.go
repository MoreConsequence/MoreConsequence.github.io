package main

import (
	"fmt"
	"os"
)

func bufferedSignal() {
	c := make(chan struct{}, 1)
	var value string
	done := make(chan struct{})

	go func() {
		value = "hello, world"
		<-c
		close(done)
	}()

	// The buffered send can complete before the goroutine receives it.
	c <- struct{}{}
	fmt.Println(value)
	<-done
}

func unbufferedSignal() {
	c := make(chan struct{})
	var value string
	done := make(chan struct{})

	go func() {
		value = "hello, world"
		<-c
		close(done)
	}()

	// The unbuffered receive happens before the send completes.
	c <- struct{}{}
	fmt.Println(value)
	<-done
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run -race main.go buffered|unbuffered")
		os.Exit(2)
	}

	switch os.Args[1] {
	case "buffered":
		bufferedSignal()
	case "unbuffered":
		unbufferedSignal()
	default:
		fmt.Fprintln(os.Stderr, "unknown mode:", os.Args[1])
		os.Exit(2)
	}
}
