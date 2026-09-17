// chunked 流式 vs Content-Length 缓冲：首字节到达时间差一个数量级。
// 标准库 only，归属父模块。运行：go test ./http-chunked/ -v
package chunked

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
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

// If-Modified-Since：客户端已是最新即 304 空身，过时即 200 全文。
func TestIfModifiedSince(t *testing.T) {
	mtime := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeContent(w, r, "f.txt", mtime, strings.NewReader("payload-v1"))
	}))
	defer srv.Close()
	fresh, _ := http.NewRequest("GET", srv.URL, nil)
	fresh.Header.Set("If-Modified-Since", mtime.Add(time.Hour).UTC().Format(http.TimeFormat))
	resp, err := http.DefaultClient.Do(fresh)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 304 {
		t.Fatalf("未过期应 304，实得 %d", resp.StatusCode)
	}
	stale, _ := http.NewRequest("GET", srv.URL, nil)
	stale.Header.Set("If-Modified-Since", mtime.Add(-time.Hour).UTC().Format(http.TimeFormat))
	resp2, err := http.DefaultClient.Do(stale)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != 200 {
		t.Fatalf("过期应 200，实得 %d", resp2.StatusCode)
	}
	t.Log("304 空身 / 200 全文对照成立")
}
