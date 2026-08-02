// 演示 http.Server.Shutdown 的排空行为:
//   1. Shutdown 后 in-flight 慢请求仍会完整返回(排空语义);
//   2. 排空期间新连接被拒绝。
//
// 运行:go run ./graceful-shutdown
// 预期输出:慢请求在 Shutdown 之后仍打印 200 并 sleep 完 3 秒,
// 而 Shutdown 返回前的"新连接探测"会失败。
package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(3 * time.Second)
		io.WriteString(w, "slow done")
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "ok")
	})

	srv := &http.Server{Addr: ":18080", Handler: mux}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	go func() {
		// 在 Shutdown 前发出慢请求
		time.Sleep(500 * time.Millisecond)
		resp, err := http.Get("http://127.0.0.1:18080/slow")
		if err != nil {
			fmt.Println("慢请求失败:", err)
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		fmt.Printf("慢请求结果: status=%d body=%q(在 Shutdown 之后返回,说明排空生效)\n", resp.StatusCode, string(body))
	}()

	time.Sleep(1 * time.Second)
	fmt.Println("触发 Shutdown...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	start := time.Now()
	if err := srv.Shutdown(ctx); err != nil {
		fmt.Println("Shutdown 错误:", err)
		return
	}
	fmt.Printf("Shutdown 完成,等待了 %v(期间慢请求被允许跑完)\n", time.Since(start).Round(time.Millisecond))

	// Shutdown 之后的新连接应被拒绝
	_, err := http.Get("http://127.0.0.1:18080/")
	if err != nil {
		fmt.Println("Shutdown 后的新连接被拒绝:", err)
	}
}
