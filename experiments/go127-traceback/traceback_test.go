// Go 1.27 traceback 携带 pprof 标签：默认可见，GODEBUG=tracebacklabels=0 关闭。
// 子进程崩溃抓 stderr 断言。构建：GOTOOLCHAIN=go1.27.1 go test ./ -v
package traceback

import (
	"context"
	"os"
	"os/exec"
	"runtime/pprof"
	"strings"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if os.Getenv("CRASH_CHILD") == "1" || os.Getenv("CRASH_BARE") == "1" {
		go func() {
			// 标签属于当前 goroutine：必须在崩溃体内部设置。
			if os.Getenv("CRASH_BARE") != "1" {
				pprof.SetGoroutineLabels(pprof.WithLabels(context.Background(), pprof.Labels("tenant", "acme", "req", "42")))
			}
			time.Sleep(50 * time.Millisecond)
			panic("boom")
		}()
		time.Sleep(2 * time.Second)
		return
	}
	os.Exit(m.Run())
}

func runChild(t *testing.T, godebug string) string {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=TestMain")
	cmd.Env = append(os.Environ(), "CRASH_CHILD=1", "GODEBUG="+godebug)
	out, _ := cmd.CombinedOutput() // 预期 panic，忽略退出码
	return string(out)
}

func TestLabelsInTraceback(t *testing.T) {
	out := runChild(t, "")
	// 渲染形如：goroutine 35 [running] {req: 42, tenant: acme}:
	if !strings.Contains(out, "tenant: acme") || !strings.Contains(out, "panic: boom") {
		t.Fatalf("traceback 应含标签与 panic，全文:\n%s", out)
	}
	t.Log("默认：标签随 traceback 输出")
}

func TestLabelsOptOut(t *testing.T) {
	out := runChild(t, "tracebacklabels=0")
	if !strings.Contains(out, "panic: boom") {
		t.Fatalf("应仍有 panic，全文:\n%s", out)
	}
	if strings.Contains(out, "tenant: acme") {
		t.Fatalf("tracebacklabels=0 后不应再带标签，全文:\n%s", out)
	}
	t.Log("tracebacklabels=0：标签被剥离，panic 仍在")
}

// 未设置标签的 goroutine 头上无花括号——标签是显式资产，不是默认附带。
func TestBareGoroutineNoBraces(t *testing.T) {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=TestMain")
	cmd.Env = append(os.Environ(), "CRASH_BARE=1", "GODEBUG=")
	out, _ := cmd.CombinedOutput()
	text := string(out)
	if !strings.Contains(text, "panic: boom") {
		t.Fatalf("应仍有 panic，全文:\n%s", text)
	}
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "goroutine ") && strings.Contains(line, "panic") {
			continue
		}
		if strings.HasPrefix(line, "goroutine ") && strings.Contains(line, "{") {
			t.Fatalf("无标签 goroutine 不应带花括号：%s", line)
		}
	}
	t.Log("无标签即无花括号")
}
