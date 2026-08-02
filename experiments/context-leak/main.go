// 演示 context 泄漏与修复。
//
// 运行:go run ./context-leak
// 观察:泄漏版(未调用 cancel)的 goroutine 数比修复版多,且进程退出时泄漏
// 的 goroutine 仍在等待一个永远不会关闭的 channel。
package main

import (
	"context"
	"fmt"
	"runtime"
	"time"
)

func work(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}
}

func main() {
	// 泄漏版:WithCancel 返回的 cancel 被塞进 slice 丢弃,goroutine 永远等不到 Done。
	// (go vet 的 lostcancel 检查会提示这一点——这正是要演示的问题。)
	var discarded []func()
	for i := 0; i < 3; i++ {
		ctx, cancel := context.WithCancel(context.Background())
		discarded = append(discarded, cancel) // 没人调用 cancel
		go work(ctx)
	}
	_ = discarded

	// 修复版:defer cancel 保证 work 能退出。
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go work(ctx)

	time.Sleep(50 * time.Millisecond)
	runtime.GC()
	fmt.Println("存活 goroutine 数:", runtime.NumGoroutine())
	fmt.Println("泄漏版创建了 3 个不会退出的 goroutine,修复版 1 个(cancel 后被回收)")
}
