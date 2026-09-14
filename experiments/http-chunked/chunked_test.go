// chunked 流式 vs Content-Length 缓冲：首字节到达时间差一个数量级。
// 标准库 only，归属父模块。运行：go test ./http-chunked/ -v
package chunked

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestChunkedFirstByteFast(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, _ := w.(http.Flusher)
		for i := 0; i < 3; i++ {
			fmt.Fprintf(w, "chunk-%d;", i)
			flusher.Flush()
			time.Sleep(100 * time.Millisecond)
		}
	}))
	defer srv.Close()
	start := time.Now()
	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	buf := make([]byte, 8)
	if _, err := io.ReadFull(resp.Body, buf); err != nil {
		t.Fatal(err)
	}
	ttfb := time.Since(start)
	io.Copy(io.Discard, resp.Body)
	if ttfb > 150*time.Millisecond {
		t.Fatalf("流式首字节应 <150ms，实测 %v", ttfb)
	}
	t.Logf("chunked TTFB=%v（总量 300ms+）", ttfb)
}

func TestBufferedFirstByteSlow(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
		fmt.Fprint(w, "all-at-once-payload")
	}))
	defer srv.Close()
	start := time.Now()
	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	buf := make([]byte, 8)
	if _, err := io.ReadFull(resp.Body, buf); err != nil {
		t.Fatal(err)
	}
	ttfb := time.Since(start)
	io.Copy(io.Discard, resp.Body)
	if ttfb < 250*time.Millisecond {
		t.Fatalf("缓冲式首字节应 ≈总量，实测 %v 过小", ttfb)
	}
	t.Logf("buffered TTFB=%v（等价总量）", ttfb)
}
