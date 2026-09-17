// HTTP Range 断点续传：206、Content-Range、尾部续接精确。
// 标准库 only，归属父模块。运行：go test ./http-range/ -v
package httprange

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var payload = strings.Repeat("0123456789", 100*1024) // 1MB 可预测内容

func serveBin(w http.ResponseWriter, r *http.Request) {
	http.ServeContent(w, r, "file.bin", time.Now(), strings.NewReader(payload))
}

func TestRangeFirst100(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serveBin(w, r)
	}))
	defer srv.Close()
	req, _ := http.NewRequest("GET", srv.URL, nil)
	req.Header.Set("Range", "bytes=0-99")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 206 {
		t.Fatalf("状态=%d，期望 206", resp.StatusCode)
	}
	if cr := resp.Header.Get("Content-Range"); cr != "bytes 0-99/1024000" {
		t.Fatalf("Content-Range=%q", cr)
	}
	if string(body) != payload[:100] {
		t.Fatal("前 100 字节不一致")
	}
}

func TestRangeResumeTail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serveBin(w, r)
	}))
	defer srv.Close()
	// 先拿一半，断线，再从 524288 续到尾。
	first := getRange(t, srv.URL, "bytes=0-524287")
	second := getRange(t, srv.URL, "bytes=524288-")
	if string(first)+string(second) != payload {
		t.Fatalf("续接后总长 %d+%d ≠ %d", len(first), len(second), len(payload))
	}
	t.Logf("续接完整：%d + %d = %d", len(first), len(second), len(payload))
}

func getRange(t *testing.T, url, rng string) []byte {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Range", rng)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 206 {
		t.Fatalf("Range %s 状态=%d", rng, resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	return body
}

// If-Range 对不上即回全文 200：内容变了还续接就是拼出坏文件。
func TestIfRangeMismatchFull(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serveBin(w, r)
	}))
	defer srv.Close()
	req, _ := http.NewRequest("GET", srv.URL, nil)
	req.Header.Set("Range", "bytes=0-99")
	req.Header.Set("If-Range", `"stale-etag"`)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 || len(body) != len(payload) {
		t.Fatalf("If-Range 失配应回全文 200，实得 %d/%d 字节", resp.StatusCode, len(body))
	}
	t.Logf("If-Range 失配回全文：%d 字节", len(body))
}
