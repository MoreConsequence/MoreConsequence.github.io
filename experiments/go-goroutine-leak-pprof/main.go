package main

import (
	"bytes"
	"flag"
	"fmt"
	"runtime"
	"runtime/pprof"
	"strings"
)

func leakOnSend(ready chan<- struct{}, blocked chan<- struct{}) {
	ready <- struct{}{}
	blocked <- struct{}{}
}

func leakOnReceive(ready chan<- struct{}, blocked <-chan struct{}) {
	ready <- struct{}{}
	<-blocked
}

func leakOnSelect(ready chan<- struct{}, blocked <-chan struct{}, never <-chan struct{}) {
	ready <- struct{}{}
	select {
	case <-blocked:
	case <-never:
	}
}

func main() {
	perKind := flag.Int("per-kind", 300, "blocked goroutines per leak shape")
	flag.Parse()
	if *perKind < 1 {
		panic("per-kind must be positive")
	}

	ready := make(chan struct{}, *perKind*3)
	blockedSend := make(chan struct{})
	blockedReceive := make(chan struct{})
	never := make(chan struct{})
	for i := 0; i < *perKind; i++ {
		go leakOnSend(ready, blockedSend)
		go leakOnReceive(ready, blockedReceive)
		go leakOnSelect(ready, blockedReceive, never)
	}
	for i := 0; i < *perKind*3; i++ {
		<-ready
	}

	runtime.GC()
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	var profile bytes.Buffer
	if err := pprof.Lookup("goroutine").WriteTo(&profile, 1); err != nil {
		panic(err)
	}

	fmt.Printf(
		"go=%s per_kind=%d leaked=%d goroutines=%d heap_alloc=%d stack_inuse=%d\n",
		runtime.Version(), *perKind, *perKind*3, runtime.NumGoroutine(), memory.HeapAlloc, memory.StackInuse,
	)
	lines := strings.Split(profile.String(), "\n")
	groups := []struct {
		name string
		line int
	}{
		{name: "main.leakOnSend", line: 14},
		{name: "main.leakOnReceive", line: 19},
		{name: "main.leakOnSelect", line: 24},
	}
	for _, group := range groups {
		for index, line := range lines {
			if index > 0 && strings.Contains(line, group.name) {
				count := strings.TrimSpace(strings.SplitN(lines[index-1], "@", 2)[0])
				fmt.Printf("profile_group=%s count=%s source_line=%d\n", group.name, count, group.line)
				break
			}
		}
	}
}
