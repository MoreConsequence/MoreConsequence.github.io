package boundary

import (
	"errors"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unsafe"
)

var (
	appendSink []int
	byteSink   []byte
	intSink    int
	anySink    any
	errSink    error
	funcSink   func() int
	stringSink string
)

func BenchmarkAppendNatural(b *testing.B) {
	const n = 65536
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		values := make([]int, 0)
		for j := 0; j < n; j++ {
			values = append(values, j)
		}
		appendSink = values
	}
}

func BenchmarkAppendPreallocated(b *testing.B) {
	const n = 65536
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		values := make([]int, 0, n)
		for j := 0; j < n; j++ {
			values = append(values, j)
		}
		appendSink = values
	}
}

func BenchmarkAtomicAdd(b *testing.B) {
	var value atomic.Int64
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		value.Add(1)
	}
	intSink = int(value.Load())
}

func BenchmarkMutexLockUnlock(b *testing.B) {
	var mu sync.Mutex
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		mu.Lock()
		intSink++
		mu.Unlock()
	}
}

func BenchmarkGoroutineCreateJoin(b *testing.B) {
	var wg sync.WaitGroup
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		wg.Add(1)
		go func() {
			wg.Done()
		}()
		wg.Wait()
	}
}

func BenchmarkAtomicParallel(b *testing.B) {
	var value atomic.Int64
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			value.Add(1)
		}
	})
	intSink = int(value.Load())
}

func BenchmarkMutexParallel(b *testing.B) {
	var value int64
	var mu sync.Mutex
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			mu.Lock()
			value++
			mu.Unlock()
		}
	})
	intSink = int(value)
}

type spinLock struct{ state atomic.Uint32 }

func (lock *spinLock) Lock() {
	for !lock.state.CompareAndSwap(0, 1) {
		// Deliberately keep spinning: this is the failure mode the article
		// contrasts with Mutex's decision to park waiters.
	}
}

func (lock *spinLock) Unlock() { lock.state.Store(0) }

func BenchmarkSpinParallel(b *testing.B) {
	var lock spinLock
	var value int64
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			lock.Lock()
			value++
			lock.Unlock()
		}
	})
	intSink = int(value)
}

func makeClosure(value int) func() int {
	return func() int { return value + 1 }
}

//go:noinline
func callClosure(fn func() int) int {
	return fn()
}

func BenchmarkClosureImmediate(b *testing.B) {
	var sum int
	for i := 0; i < b.N; i++ {
		sum += func(value int) int { return value + 1 }(i)
	}
	intSink = sum
}

func BenchmarkClosureEscaping(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		// Global storage makes the closure outlive this iteration, forcing the
		// compiler to preserve the function value and captured environment.
		funcSink = makeClosure(i)
		intSink = callClosure(funcSink)
	}
}

//go:noinline
func directCall(value int) int { return value + 1 }

func BenchmarkClosureLoopCollection(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		callbacks := make([]func() int, 0, 4)
		for j := 0; j < 4; j++ {
			callbacks = append(callbacks, makeClosure(j))
		}
		intSink = callbacks[0]() + callbacks[1]() + callbacks[2]() + callbacks[3]()
	}
}

//go:noinline
func directDeferTarget(value *int) { *value++ }

//go:noinline
func callWithDefer(value int) int {
	result := value
	defer directDeferTarget(&result)
	return result
}

func BenchmarkDefer(b *testing.B) {
	for i := 0; i < b.N; i++ {
		intSink = callWithDefer(i)
	}
}

func BenchmarkDirectCall(b *testing.B) {
	for i := 0; i < b.N; i++ {
		intSink = directCall(i)
	}
}

func deferInLoop() {
	var value int
	for i := 0; i < 100; i++ {
		defer directDeferTarget(&value)
	}
	intSink = value
}

func directLoop() {
	var value int
	for i := 0; i < 100; i++ {
		directDeferTarget(&value)
	}
	intSink = value
}

func BenchmarkDeferInLoop(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		deferInLoop()
	}
}

func BenchmarkDirectLoop(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		directLoop()
	}
}

func panicRecover() {
	defer func() { _ = recover() }()
	panic("expected benchmark panic")
}

func panicRecoverDepth(depth int) {
	if depth == 0 {
		panic("expected benchmark panic")
	}
	panicRecoverDepth(depth - 1)
}

func BenchmarkPanicRecover(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		panicRecover()
	}
}

func BenchmarkPanicRecoverDepth100(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		func() {
			defer func() { _ = recover() }()
			panicRecoverDepth(100)
		}()
	}
}

func BenchmarkErrorReturn(b *testing.B) {
	for i := 0; i < b.N; i++ {
		errSink = sentinel
	}
}

var sentinel = errors.New("sentinel")

func BenchmarkSentinelCompare(b *testing.B) {
	err := sentinel
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if err != sentinel {
			b.Fatal("sentinel changed")
		}
	}
}

func errorChain(depth int) error {
	err := sentinel
	for i := 0; i < depth; i++ {
		err = fmt.Errorf("layer %d: %w", i, err)
	}
	return err
}

func BenchmarkErrorsIs10(b *testing.B) {
	err := errorChain(10)
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if !errors.Is(err, sentinel) {
			b.Fatal("sentinel not found")
		}
	}
	errSink = err
}

func BenchmarkErrorsIsDepths(b *testing.B) {
	for _, depth := range []int{0, 1, 3, 10} {
		b.Run(fmt.Sprintf("depth=%d", depth), func(b *testing.B) {
			err := errorChain(depth)
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				if !errors.Is(err, sentinel) {
					b.Fatal("sentinel not found")
				}
			}
			errSink = err
		})
	}
}

func BenchmarkErrorsNew(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		errSink = errors.New("new error")
	}
}

func BenchmarkFmtErrorfWrap(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		errSink = fmt.Errorf("request %d: %w", i, sentinel)
	}
}

func BenchmarkErrorsJoin(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		errSink = errors.Join(sentinel, sentinel)
	}
}

type square int

func (s square) Area() int { return int(s * s) }

type shape interface{ Area() int }

//go:noinline
func areaOf(value shape) int { return value.Area() }

//go:noinline
func directArea(value square) int { return value.Area() }

func BenchmarkDirectArea(b *testing.B) {
	value := square(7)
	for i := 0; i < b.N; i++ {
		intSink = directArea(value)
	}
}

func BenchmarkInterfaceDispatch(b *testing.B) {
	var value shape = square(7)
	for i := 0; i < b.N; i++ {
		intSink = areaOf(value)
	}
}

type bigValue struct{ fields [4]int64 }

func BenchmarkInterfaceBoxInt(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		anySink = i
	}
}

func BenchmarkInterfaceBoxBigValue(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		anySink = bigValue{fields: [4]int64{int64(i)}}
	}
}

func BenchmarkTypeAssertion(b *testing.B) {
	var value any = 7
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		intSink = value.(int)
	}
}

var bytePool = sync.Pool{New: func() any { return new([256]byte) }}

func BenchmarkSyncPool256(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		value := bytePool.Get().(*[256]byte)
		value[0] = byte(i)
		bytePool.Put(value)
	}
}

func BenchmarkAllocate256(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		value := new([256]byte)
		value[0] = byte(i)
		anySink = value
	}
}

func BenchmarkMapLookup(b *testing.B) {
	values := make(map[string]int, 1024)
	for i := 0; i < 1024; i++ {
		values[fmt.Sprintf("key-%d", i)] = i
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		intSink = values["key-1023"]
	}
}

func BenchmarkMapLookupSizes(b *testing.B) {
	for _, size := range []int{8, 64, 1024, 65536} {
		b.Run(fmt.Sprintf("n=%d", size), func(b *testing.B) {
			values := make(map[string]int, size)
			for i := 0; i < size; i++ {
				values[fmt.Sprintf("key-%d", i)] = i
			}
			key := fmt.Sprintf("key-%d", size-1)
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				intSink = values[key]
			}
		})
	}
}

func BenchmarkSliceLookup(b *testing.B) {
	values := make([]string, 1024)
	for i := range values {
		values[i] = fmt.Sprintf("key-%d", i)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for j, value := range values {
			if value == "key-1023" {
				intSink = j
				break
			}
		}
	}
}

func BenchmarkSliceLookupSizes(b *testing.B) {
	for _, size := range []int{8, 64, 1024} {
		b.Run(fmt.Sprintf("n=%d", size), func(b *testing.B) {
			values := make([]string, size)
			for i := range values {
				values[i] = fmt.Sprintf("key-%d", i)
			}
			key := fmt.Sprintf("key-%d", size-1)
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				for j, value := range values {
					if value == key {
						intSink = j
						break
					}
				}
			}
		})
	}
}

func BenchmarkMapInsertNoHint(b *testing.B) {
	const n = 100000
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		values := make(map[string]int)
		for j := 0; j < n; j++ {
			values[fmt.Sprintf("key-%d", j)] = j
		}
		anySink = values
	}
}

func BenchmarkMapInsertHint(b *testing.B) {
	const n = 100000
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		values := make(map[string]int, n)
		for j := 0; j < n; j++ {
			values[fmt.Sprintf("key-%d", j)] = j
		}
		anySink = values
	}
}

func BenchmarkRuntimeKeepAlive(b *testing.B) {
	for i := 0; i < b.N; i++ {
		value := new([256]byte)
		runtime.KeepAlive(value)
		anySink = value
	}
}

func BenchmarkChannelSend(b *testing.B) {
	for _, capacity := range []int{0, 1, 16, 256} {
		b.Run(fmt.Sprintf("cap=%d", capacity), func(b *testing.B) {
			ch := make(chan int, capacity)
			done := make(chan struct{})
			go func() {
				for range ch {
				}
				close(done)
			}()
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				ch <- i
			}
			b.StopTimer()
			close(ch)
			<-done
		})
	}
}

func BenchmarkChannelParallelSend(b *testing.B) {
	ch := make(chan int, 256)
	done := make(chan struct{})
	go func() {
		for range ch {
		}
		close(done)
	}()
	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			ch <- 1
		}
	})
	close(ch)
	<-done
}

func BenchmarkSelect1CaseDefault(b *testing.B) {
	stop := make(chan struct{})
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		select {
		case <-stop:
			intSink++
		default:
			intSink--
		}
	}
}

func BenchmarkSelect2CaseDefault(b *testing.B) {
	a := make(chan struct{})
	bch := make(chan struct{})
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		select {
		case <-a:
			intSink++
		case <-bch:
			intSink++
		default:
			intSink--
		}
	}
}

func BenchmarkSelect4CaseDefault(b *testing.B) {
	a := make(chan struct{})
	bch := make(chan struct{})
	c := make(chan struct{})
	d := make(chan struct{})
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		select {
		case <-a:
			intSink++
		case <-bch:
			intSink++
		case <-c:
			intSink++
		case <-d:
			intSink++
		default:
			intSink--
		}
	}
}

func BenchmarkSelect8CaseDefault(b *testing.B) {
	a := make(chan struct{})
	bch := make(chan struct{})
	c := make(chan struct{})
	d := make(chan struct{})
	e := make(chan struct{})
	f := make(chan struct{})
	g := make(chan struct{})
	h := make(chan struct{})
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		select {
		case <-a:
			intSink++
		case <-bch:
			intSink++
		case <-c:
			intSink++
		case <-d:
			intSink++
		case <-e:
			intSink++
		case <-f:
			intSink++
		case <-g:
			intSink++
		case <-h:
			intSink++
		default:
			intSink--
		}
	}
}

type lockedIntMap struct {
	mu sync.RWMutex
	m  map[int]int
}

func newLockedIntMap(size int) *lockedIntMap {
	values := &lockedIntMap{m: make(map[int]int, size)}
	for i := 0; i < size; i++ {
		values.m[i] = i
	}
	return values
}

func BenchmarkSyncMapReadParallel(b *testing.B) {
	const size = 8
	b.Run("sync.Map", func(b *testing.B) {
		var values sync.Map
		for i := 0; i < size; i++ {
			values.Store(i, i)
		}
		b.ReportAllocs()
		b.RunParallel(func(pb *testing.PB) {
			key := 0
			for pb.Next() {
				value, _ := values.Load(key)
				runtime.KeepAlive(value)
				key++
				if key == size {
					key = 0
				}
			}
		})
	})
	b.Run("mutex-map", func(b *testing.B) {
		values := newLockedIntMap(size)
		b.ReportAllocs()
		b.RunParallel(func(pb *testing.PB) {
			key := 0
			for pb.Next() {
				values.mu.RLock()
				value := values.m[key]
				values.mu.RUnlock()
				runtime.KeepAlive(value)
				key++
				if key == size {
					key = 0
				}
			}
		})
	})
}

func BenchmarkSyncMapWriteParallel(b *testing.B) {
	const size = 8
	b.Run("sync.Map", func(b *testing.B) {
		var values sync.Map
		for i := 0; i < size; i++ {
			values.Store(i, i)
		}
		b.ReportAllocs()
		b.RunParallel(func(pb *testing.PB) {
			key := 0
			for pb.Next() {
				values.Store(key, key)
				key++
				if key == size {
					key = 0
				}
			}
		})
	})
	b.Run("mutex-map", func(b *testing.B) {
		values := newLockedIntMap(size)
		b.ReportAllocs()
		b.RunParallel(func(pb *testing.PB) {
			key := 0
			for pb.Next() {
				values.mu.Lock()
				values.m[key] = key
				values.mu.Unlock()
				key++
				if key == size {
					key = 0
				}
			}
		})
	})
}

func BenchmarkAtomicValueReadParallel(b *testing.B) {
	var value atomic.Value
	value.Store(1)
	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			stored := value.Load().(int)
			runtime.KeepAlive(stored)
		}
	})
}

func BenchmarkTimeAfterHour(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		select {
		case <-time.After(time.Hour):
		default:
		}
	}
}

func BenchmarkNewTimerStop(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		timer := time.NewTimer(time.Hour)
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
	}
}

func BenchmarkNewTimerReset(b *testing.B) {
	timer := time.NewTimer(time.Hour)
	defer timer.Stop()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		timer.Reset(time.Hour)
	}
}

var (
	string32 = "0123456789abcdef0123456789abcdef"
	bytes32  = []byte(string32)
	string8K = strings.Repeat("x", 8*1024)
	bytes8K  = []byte(string8K)
)

func BenchmarkStringFromBytes32(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		stringSink = string(bytes32)
	}
}

func BenchmarkBytesFromString32(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		byteSink = []byte(string32)
	}
}

func BenchmarkStringFromBytes8K(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		stringSink = string(bytes8K)
	}
}

func BenchmarkBytesFromString8K(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		byteSink = []byte(string8K)
	}
}

func BenchmarkMapLookupStringBytes(b *testing.B) {
	values := map[string]int{string32: 1}
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		intSink = values[string(bytes32)]
	}
}

func BenchmarkUnsafeString(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		stringSink = unsafe.String(unsafe.SliceData(bytes32), len(bytes32))
	}
}

func BenchmarkStringPlusLoop(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		value := ""
		for j := 0; j < 100; j++ {
			value += "x"
		}
		stringSink = value
	}
}

func BenchmarkStringBuilderLoop(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		var builder strings.Builder
		builder.Grow(100)
		for j := 0; j < 100; j++ {
			builder.WriteByte('x')
		}
		stringSink = builder.String()
	}
}
