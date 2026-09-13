// Go 1.27：goroutineleak 画像——WriteTo 触发泄漏检测 GC，量的不是阻塞，是不可达。
// 构建：GOTOOLCHAIN=go1.27.0 go test ./ -run TestGoroutineLeak -v
package jsonleak

import (
	"io"
	"runtime"
	"runtime/pprof"
	"testing"
	"time"
)

// 真泄漏：channel 与 goroutine 在函数返回后彻底不可达（阻塞且永无发送者）。
func leakUnreachable() {
	c := make(chan struct{})
	go func() { <-c }()
}

// 检测性 GC 跑一轮，返回画像计数。
func leakCount(t *testing.T) int {
	t.Helper()
	prof := pprof.Lookup("goroutineleak")
	if prof == nil {
		t.Fatal("无 goroutineleak 画像（需 go1.27 工具链）")
	}
	if err := prof.WriteTo(io.Discard, 0); err != nil {
		t.Fatalf("画像写入失败: %v", err)
	}
	return prof.Count()
}

func TestGoroutineLeak(t *testing.T) {
	base := leakCount(t)

	// T1：50 个不可达泄漏 → 画像增长约 50。
	const N = 50
	for i := 0; i < N; i++ {
		leakUnreachable()
	}
	// 先让泄漏体调度起来进入阻塞态，否则画像时仍在 runnable，不算候选。
	for i := 0; i < 50; i++ {
		runtime.Gosched()
	}
	time.Sleep(200 * time.Millisecond)
	if got := leakCount(t); got < base+N {
		t.Fatalf("不可达泄漏 %d 个，画像=%d，期望>=%d", N, got, base+N)
	} else {
		t.Logf("不可达泄漏 %d 个，画像 %d → %d", N, base, got)
	}

	// T2（对照）：50 个可达阻塞（release 仍被持有）→ 画像纹丝不动。
	// 证明画像量的不是“阻塞”，是 GC 不可达。
	release := make(chan struct{})
	for i := 0; i < N; i++ {
		go func() { <-release }()
	}
	for i := 0; i < 50; i++ {
		runtime.Gosched()
	}
	time.Sleep(200 * time.Millisecond)
	after := leakCount(t)
	if after != base+N {
		t.Fatalf("可达阻塞不应计入泄漏：画像=%d，期望 %d", after, base+N)
	}
	t.Logf("可达阻塞 %d 个，画像保持 %d", N, after)
	close(release)
}
