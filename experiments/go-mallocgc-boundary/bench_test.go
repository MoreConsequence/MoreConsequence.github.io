package mallocgc

import (
	"runtime"
	"sync/atomic"
	"testing"
)

var sinkPtr *byte
var parallelSink atomic.Pointer[byte]

func benchmarkAllocate(b *testing.B, size int) {
	b.Helper()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		value := make([]byte, size)
		value[0] = byte(i)
		sinkPtr = &value[0]
	}
}

func BenchmarkAllocate16(b *testing.B)   { benchmarkAllocate(b, 16) }
func BenchmarkAllocate32(b *testing.B)   { benchmarkAllocate(b, 32) }
func BenchmarkAllocate256(b *testing.B)  { benchmarkAllocate(b, 256) }
func BenchmarkAllocate4096(b *testing.B) { benchmarkAllocate(b, 4096) }

func benchmarkAllocateParallel(b *testing.B, size int) {
	b.Helper()
	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			value := make([]byte, size)
			value[0] = 1
			parallelSink.Store(&value[0])
			runtime.KeepAlive(value)
		}
	})
}

func BenchmarkAllocateParallel256(b *testing.B)  { benchmarkAllocateParallel(b, 256) }
func BenchmarkAllocateParallel4096(b *testing.B) { benchmarkAllocateParallel(b, 4096) }
