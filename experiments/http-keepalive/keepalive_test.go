// HTTP keep-alive：复用、禁用、空闲超时的连接计数。
// 标准库 only，归属父模块 experiments。运行：go test ./http-keepalive/ -v
package keepalive

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func newCountedServer(idle time.Duration, conns *atomic.Int32) *httptest.Server {
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "ok")
	}))
	srv.Config.ConnState = func(c net.Conn, s http.ConnState) {
		if s == http.StateNew {
			conns.Add(1)
		}
	}
	srv.Config.IdleTimeout = idle
	srv.Start()
	return srv
}

func doN(t *testing.T, client *http.Client, url string, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		resp, err := client.Get(url)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

// 默认 Transport 复用：10 请求只建 1 连接。
func TestKeepAliveReuse(t *testing.T) {
	var conns atomic.Int32
	srv := newCountedServer(0, &conns)
	defer srv.Close()
	doN(t, srv.Client(), srv.URL, 10)
	if got := conns.Load(); got != 1 {
		t.Fatalf("复用下新建连接=%d，期望 1", got)
	}
}

// 禁用 keep-alive：10 请求建 10 连接。
func TestKeepAliveDisabled(t *testing.T) {
	var conns atomic.Int32
	srv := newCountedServer(0, &conns)
	defer srv.Close()
	tr := srv.Client().Transport.(*http.Transport).Clone()
	tr.DisableKeepAlives = true
	doN(t, &http.Client{Transport: tr}, srv.URL, 10)
	if got := conns.Load(); got != 10 {
		t.Fatalf("禁用下新建连接=%d，期望 10", got)
	}
}

// 服务端空闲超时：5 请求 → 闲 300ms → 5 请求，共 2 连接。
func TestIdleTimeoutRedial(t *testing.T) {
	var conns atomic.Int32
	srv := newCountedServer(100*time.Millisecond, &conns)
	defer srv.Close()
	c := srv.Client()
	doN(t, c, srv.URL, 5)
	time.Sleep(300 * time.Millisecond)
	doN(t, c, srv.URL, 5)
	if got := conns.Load(); got != 2 {
		t.Fatalf("空闲超时后新建连接=%d，期望 2", got)
	}
}
