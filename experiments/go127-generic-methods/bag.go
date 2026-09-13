// Go 1.27 泛型方法正例：类型转换操作回到类型身上，不再是包级函数。
package methods

// Bag 是同质容器；Map 把 Bag[E] 变成 Bag[R]，R 由方法自己声明。
type Bag[E any] struct{ items []E }

func NewBag[E any](items ...E) Bag[E] { return Bag[E]{items: items} }

func (b Bag[E]) Map[R any](f func(E) R) Bag[R] {
	out := make([]R, 0, len(b.items))
	for _, e := range b.items {
		out = append(out, f(e))
	}
	return Bag[R]{items: out}
}

func (b Bag[E]) Items() []E { return b.items }
