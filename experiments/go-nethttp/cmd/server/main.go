package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
)

// countingListener counts every TCP connection accepted on the *data* port.
// The article compares this "server-side accept count" across pool sizes:
// a miss in the client's idle pool shows up here as a brand-new connection.
type countingListener struct {
	net.Listener
	accepts atomic.Int64 // total connections accepted
	open    atomic.Int64 // currently open connections
}

func (l *countingListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	l.accepts.Add(1)
	l.open.Add(1)
	return &countingConn{Conn: c, l: l}, nil
}

type countingConn struct {
	net.Conn
	l *countingListener
}

func (c *countingConn) Close() error {
	c.l.open.Add(-1)
	return c.Conn.Close()
}

func main() {
	addr := ":18765"
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatal(err)
	}
	cl := &countingListener{Listener: ln}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Fixed server-side cost so both pool sizes serve the same work unit.
		time.Sleep(5 * time.Millisecond)
		_, _ = w.Write([]byte("ok"))
	})
	// Serve /stats on a *separate, uncounted* port so probing it never
	// pollutes the accept counter on the data port.
	go func() {
		statsMux := http.NewServeMux()
		statsMux.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]int64{
				"accepts": cl.accepts.Load(),
				"open":    cl.open.Load(),
			})
		})
		log.Fatal(http.ListenAndServe(":18766", statsMux))
	}()

	srv := &http.Server{Handler: mux}
	go func() {
		if err := srv.Serve(cl); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	fmt.Printf("server listening on %s (HTTP/1.1, 5ms/handler)\n", addr)
	fmt.Println("stats on http://127.0.0.1:18766/stats")

	// On SIGINT print the ground-truth accept count for manual cross-check.
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	fmt.Printf("ACCEPTS=%d OPEN=%d\n", cl.accepts.Load(), cl.open.Load())
	os.Exit(0)
}
