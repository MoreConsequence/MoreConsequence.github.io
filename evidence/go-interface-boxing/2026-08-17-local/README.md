# interface typed-nil 语义 smoke

## 运行入口

```bash
cd experiments/go-interface-contract
go run main.go
```

## 原始输出

```text
any_typed_nil=false
reader_typed_nil=false
```

这只验证接口值携带动态指针类型时，接口本身不等于 `nil`。它不证明任意 nil receiver 方法都安全；方法是否允许 nil receiver 仍是具体类型的 API 合同。

## 环境边界

本次运行使用 Go 1.25.1、Darwin arm64。方法集、接口赋值和 typed-nil 是语言语义示例；它没有测量接口分派、装箱分配或泛型性能。
