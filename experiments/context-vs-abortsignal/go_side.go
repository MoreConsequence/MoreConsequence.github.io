// Go 侧: context 取消语义演示
package main

import (
	"context"
	"fmt"
	"runtime"
	"time"
)

func main() {
	// 1. cancel 是同步信号, 但清理必须自己写
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			select {
			case <-ctx.Done():
				fmt.Println("goroutine got cancel, code:",
					ctx.Err() == context.Canceled) // 取消原因: Canceled
				return
			case <-time.After(10 * time.Millisecond):
			}
		}
	}()
	cancel() // 同步: 立即生效
	<-done

	// 2. deadline: 到点自动取消, Err() 变成 DeadlineExceeded
	ctx2, _ := context.WithTimeout(context.Background(), 30*time.Millisecond)
	<-ctx2.Done()
	fmt.Println("deadline Err:", ctx2.Err() == context.DeadlineExceeded)

	// 3. 取消的传播是显式的: 子 ctx 取消不会取消父
	parent, pCancel := context.WithCancel(context.Background())
	child, cCancel := context.WithCancel(parent)
	cCancel()
	fmt.Printf("child canceled=%v parent canceled=%v\n",
		child.Err() != nil, parent.Err() == nil)
	pCancel()

	// 4. WithValue 不参与取消, 但必须拿出来
	ctxv := context.WithValue(context.Background(), "k", "v")
	runtime.KeepAlive(ctxv)
	fmt.Println("value:", ctxv.Value("k"))

	// 5. 取消不清理资源: 典型泄漏模式
	leakCtx, leakCancel := context.WithCancel(context.Background())
	_ = leakCtx
	time.Sleep(1 * time.Millisecond)
	leakCancel() // 只取消, goroutine 若没监听 Done 就永远活着
	fmt.Println("只要 goroutine 不看 ctx.Done, cancel 就管不到它")
}
