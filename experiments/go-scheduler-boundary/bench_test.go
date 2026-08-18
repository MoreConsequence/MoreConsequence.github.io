package scheduler

import (
	"sync"
	"testing"
)

func BenchmarkGoroutineCreate(b *testing.B) {
	var wait sync.WaitGroup
	wait.Add(b.N)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		go func() { wait.Done() }()
	}
	wait.Wait()
}

func BenchmarkChannelPingPong(b *testing.B) {
	channel := make(chan int)
	var wait sync.WaitGroup
	wait.Add(1)
	go func() {
		defer wait.Done()
		for i := 0; i < b.N; i++ {
			<-channel
		}
	}()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		channel <- i
	}
	wait.Wait()
}
