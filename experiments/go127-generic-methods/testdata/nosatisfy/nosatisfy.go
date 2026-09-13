// 反例 2：泛型方法不能实现接口——赋值必须失败。
package nosatisfy

type Printer interface {
	Print(v any)
}

type S struct{}

func (S) Print[T any](v T) {}

var _ Printer = S{}
