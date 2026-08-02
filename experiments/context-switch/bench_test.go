// goroutine 与 OS 线程的切换开销基准。
//
// 运行:go test -bench=. -benchtime=1s ./context-switch
// 结果解释:goroutine 切换(同一 P 内)开销通常在几十 ns 到几百 ns 量级,
// OS 线程切换(借助 runtime.LockOSThread + 通道)是微秒级起。
// 数字因机器而异,请在自己的机器上实测。
package ctxswitch

import (
	"runtime"
	"sync"
	"testing"
)

// BenchmarkGoroutineSwitch 测同一线程内两个 goroutine 乒乓切换的开销。
func BenchmarkGoroutineSwitch(b *testing.B) {
	ch := make(chan struct{})
	done := make(chan struct{})
	go func() {
		for i := 0; i < b.N; i++ {
			<-ch
			ch <- struct{}{}
		}
		done <- struct{}{}
	}()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ch <- struct{}{}
		<-ch
	}
	b.StopTimer()
	<-done
}

// BenchmarkThreadSwitch 测两个锁死线程间的乒乓切换开销。
func BenchmarkThreadSwitch(b *testing.B) {
	ch := make(chan struct{})
	done := make(chan struct{})
	go func() {
		runtime.LockOSThread()
		for i := 0; i < b.N; i++ {
			<-ch
			ch <- struct{}{}
		}
		done <- struct{}{}
	}()
	runtime.LockOSThread()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ch <- struct{}{}
		<-ch
	}
	b.StopTimer()
	<-done
}

func TestBenchmarksCompile(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { wg.Done() }()
	wg.Wait()
}
