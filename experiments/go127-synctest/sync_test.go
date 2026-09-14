// testing/synctest：虚拟时钟 + 阻塞断言，并发测试毫秒级跑完。
// 构建：GOTOOLCHAIN=go1.27.1 go test ./ -v（独立 go.mod）
package synctest

import (
	"testing"
	"testing/synctest"
	"time"
)

// 虚拟时间：代码里 Sleep 一小时，测试毫秒级结束。
func TestFakeClockFast(t *testing.T) {
	start := time.Now()
	synctest.Test(t, func(t *testing.T) {
		time.Sleep(time.Hour)
		ch := make(chan string, 1)
		go func() {
			time.Sleep(30 * time.Minute)
			ch <- "done"
		}()
		if got := <-ch; got != "done" {
			t.Fatalf("结果=%q", got)
		}
	})
	if elapsed := time.Since(start); elapsed > 10*time.Second {
		t.Fatalf("虚拟时钟下应毫秒级完成，实耗 %v", elapsed)
	}
}

// 阻塞断言：Wait 返回即“除测试体外全阻塞”，顺手证无泄漏。
func TestWaitAllBlocked(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		release := make(chan struct{})
		done := make(chan struct{})
		go func() {
			<-release
			close(done)
		}()
		synctest.Wait() // 若有 goroutine 可运行，Wait 会等它
		select {
		case <-done:
			t.Fatal("release 前 done 不应关闭")
		default:
		}
		close(release)
		<-done
	})
}

// 气泡隔离：两个气泡各走各的虚拟时钟，互不干扰。
func TestBubbleIsolation(t *testing.T) {
	read := func(d time.Duration) time.Time {
		var now time.Time
		synctest.Test(t, func(t *testing.T) {
			time.Sleep(d)
			now = time.Now()
		})
		return now
	}
	a, b := read(time.Hour), read(2*time.Hour)
	// 气泡时钟起点固定为 UTC 2000-01-01 午夜（与本地时区无关）。
	wantA := time.Date(2000, 1, 1, 1, 0, 0, 0, time.UTC)
	wantB := time.Date(2000, 1, 1, 2, 0, 0, 0, time.UTC)
	if !a.Equal(wantA) || !b.Equal(wantB) {
		t.Fatalf("气泡时钟应各自独立：%v vs %v", a.UTC(), b.UTC())
	}
}
