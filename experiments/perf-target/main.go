// perf 采样用的目标程序:一个持续的 CPU 忙循环,占住几个核。
//
// 用法:
//   1. 运行:go run ./perf-target(或先 go build 再运行二进制)
//   2. 在另一个终端采样:
//      perf record -F 99 -g -p $(pgrep -f perf-target) -- sleep 10
//      perf report --stdio
//   3. 结束:Ctrl+C
package main

import (
	"flag"
	"fmt"
	"math/rand"
	"os"
	"runtime"
	"time"
)

func hashLoop(seed int64) {
	r := rand.New(rand.NewSource(seed))
	acc := int64(0)
	for {
		for i := 0; i < 1_000_000; i++ {
			acc += r.Int63n(1000)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func main() {
	cores := flag.Int("cores", 2, "占用的 CPU 核数")
	flag.Parse()
	fmt.Printf("perf-target 运行中(占 %d 核),pid=%d。\n可用 perf record -F 99 -g -p %d -- sleep 10 采样。\n", *cores, os.Getpid(), os.Getpid())
	for i := 0; i < *cores; i++ {
		go hashLoop(int64(i + 1))
	}
	runtime.Goexit()
}
