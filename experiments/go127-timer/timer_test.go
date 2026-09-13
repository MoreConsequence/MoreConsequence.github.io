// Go 1.27 timer 通道恒同步：无缓冲、恰好一次、Stop/Reset 语义。
// 构建：GOTOOLCHAIN=go1.27.1 go test ./ -v
package timer

import (
	"testing"
	"time"
)

// 通道无缓冲：同步的直接证据（旧 asynctimerchan 时代不可断言）。
func TestAfterUnbuffered(t *testing.T) {
	ch := time.After(5 * time.Millisecond)
	if cap(ch) != 0 {
		t.Fatalf("After 通道 cap=%d，期望 0（同步）", cap(ch))
	}
	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatal("超时未触发")
	}
}

// 恰好一次：After 只投递一个值（等价 NewTimer(d).C）。
func TestAfterSingleDelivery(t *testing.T) {
	ch := time.After(5 * time.Millisecond)
	<-ch
	select {
	case v := <-ch:
		t.Fatalf("第二次读到值 %v，期望恰好一次", v)
	case <-time.After(50 * time.Millisecond):
	}
}

// Stop 阻止触发；Reset 复用同一 Timer。
func TestStopReset(t *testing.T) {
	tm := time.NewTimer(20 * time.Millisecond)
	if !tm.Stop() {
		t.Fatal("未触发前 Stop 应返回 true")
	}
	select {
	case <-tm.C:
		t.Fatal("Stop 后不应触发")
	case <-time.After(60 * time.Millisecond):
	}
	tm.Reset(10 * time.Millisecond)
	select {
	case <-tm.C:
	case <-time.After(2 * time.Second):
		t.Fatal("Reset 后应触发")
	}
}
