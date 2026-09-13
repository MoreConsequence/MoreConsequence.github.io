// 反例 1：接口方法声明自己的类型参数——编译必须失败。
package ifacegeneric

type Doer interface {
	Do[T any](v T)
}
