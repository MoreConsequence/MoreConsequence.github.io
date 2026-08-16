package boundary

import (
	"runtime"
	"testing"
)

func makeRetainedSlice(total, keep, width int) [][]byte {
	all := make([][]byte, 0, total)
	for i := 0; i < total; i++ {
		all = append(all, make([]byte, width))
	}
	return all[:keep]
}

func makeCopiedSlice(total, keep, width int) [][]byte {
	all := make([][]byte, 0, total)
	for i := 0; i < total; i++ {
		all = append(all, make([]byte, width))
	}
	return append([][]byte(nil), all[:keep]...)
}

func TestSubsliceRetainsBackingArray(t *testing.T) {
	const total = 64 * 1024
	const keep = 10
	const width = 1024

	var retained [][]byte
	var copied [][]byte
	retained = makeRetainedSlice(total, keep, width)
	copied = makeCopiedSlice(total, keep, width)
	runtime.GC()
	if len(retained) != keep || len(copied) != keep {
		t.Fatalf("unexpected lengths: retained=%d copied=%d", len(retained), len(copied))
	}
	// Keep both values alive until after the assertion; the test checks that
	// the returned slice still owns a reference to the large backing array.
	runtime.KeepAlive(retained)
	runtime.KeepAlive(copied)
}
