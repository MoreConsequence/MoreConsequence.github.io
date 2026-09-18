package methods

import (
	"math/rand/v2"
	"reflect"
	"testing"
)

func TestMapTransform(t *testing.T) {
	got := NewBag(1, 2, 3).Map(func(e int) string {
		return string(rune('a' + e))
	}).Items()
	if !reflect.DeepEqual(got, []string{"b", "c", "d"}) {
		t.Fatalf("Map 结果=%v", got)
	}
}

func TestInferenceNoTypeArgs(t *testing.T) {
	// 方法类型实参可推导：调用处不写 [string] 也能过。
	got := NewBag(1, 2).Map(func(e int) int { return e * 10 }).Items()
	if !reflect.DeepEqual(got, []int{10, 20}) {
		t.Fatalf("推导结果=%v", got)
	}
}

// 显式实参：推导信息不足时手动给 [R]，与推导版结果一致。
func TestExplicitTypeArgs(t *testing.T) {
	a := NewBag(1, 2).Map(func(e int) int { return e + 1 }).Items()
	b := NewBag(1, 2).Map[int](func(e int) int { return e + 1 }).Items()
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("显式与推导不一致: %v vs %v", a, b)
	}
}

func TestStdlibGenericMethod(t *testing.T) {
	// 标准库实例：math/rand/v2.(*Rand).N[Int]，同方法覆盖全部整数类型。
	rng := rand.New(rand.NewPCG(1, 2))
	var i8 int8 = rng.N[int8](100)
	var u64 uint64 = rng.N[uint64](100)
	if i8 < 0 || i8 >= 100 || u64 >= 100 {
		t.Fatalf("rand.N 越界: %d %d", i8, u64)
	}
}
