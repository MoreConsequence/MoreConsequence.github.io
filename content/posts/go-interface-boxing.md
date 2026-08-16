---
title: "interface 的真相：动态分派 2ns、标量装箱零分配、大对象才付账"
description: "统一 benchmark 在 Go 1.25.1/arm64 下测得接口动态分派 2.07ns，与直接调用 2.09ns 同价；int 装箱 8.30ns/8B/0 allocs，32B struct 装箱 12.10ns/32B/1 alloc。类型断言的静态已知类型路径只有 0.31ns，不能外推到任意动态输入。真实成本分界仍是大对象装箱的分配税，以及高频间接调用打断内联的 cache 税。"
publishedAt: "2026-08-15"
updatedAt: "2026-08-16"
tags: ["Go", "语言机制", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** "interface 有性能问题"是过时知识，但“完全没有成本”同样不准确。统一 benchmark（Go 1.25.1/arm64）测得：接口方法调用 **2.07ns**，直接调用 **2.09ns**；`int` 装箱 **8.30ns/8B/0 allocs**；32B struct 装箱 **12.10ns/32B/1 alloc**。类型断言的静态已知类型路径是 **0.31ns**，只说明编译器看穿了这个特定值，不能当作所有动态断言的常数。真实成本在大对象分配，以及无法去虚拟化的热调用。

## 一、接口值的内存形态：iface 与 eface

Go 的接口值只有两种形态（runtime/runtime2.go）：

```go
type eface struct { // 空接口 any
	_type *_type
	data  unsafe.Pointer
}

type ITab struct { // 非空接口的方法表（internal/abi/iface.go）
	Inter *InterfaceType
	Type  *Type
	Hash  uint32
	Fun   [1]uintptr // 方法实现表，fun[0]==0 表示未实现
}

type iface struct {
	tab  *ITab
	data unsafe.Pointer
}
```

两个关键设计：

1. **data 槽位直接存标量**：对 int、指针等 ≤ 指针大小的类型，装箱时值直接放进 `data`（无需堆分配）；只有大对象才需要 data 指向堆。
2. **itab 按 (类型, 接口) 对缓存**：第一次把 `Square` 装进 `Shape` 时构造 itab，之后全局复用；方法调用是 `tab.Fun[i]` 的一次间接跳转。

## 二、实测：动态分派与静态调用同价

| 场景 | ns/op | B/op | allocs |
|---|---|---|---|
| 直接调用（noinline 包装） | **2.09** | 0 | 0 |
| **接口调用（动态分派）** | **2.07** | 0 | 0 |
| 类型断言 `v.(int)`（静态已知动态类型） | **0.31** | 0 | 0 |

接口调用与直接调用的差异在本次 run 里只有 0.02ns，属于噪声范围。原因可能是方法体短且编译器能去虚拟化；要研究真正的 itab 间接跳转，应使用多个实现、跨包调用或阻止去虚拟化的实验，而不能从这两个数字断言所有接口调用都同价。

## 三、装箱：标量零分配，大对象才付账

| 装箱对象 | ns/op | B/op | allocs |
|---|---|---|---|
| `int` | **8.30** | 8 | **0** |
| 32B struct | **12.10** | 32 | **1** |

int 装箱的 0 allocs 不是巧合：**标量直接写进 eface.data 位**，没有任何指针需要指向堆。8B/op 是接口值本身的写入。直到对象超过指针大小、data 放不下，才产生 1 次堆分配（32B struct：12.10ns/1 alloc）。字符串转换、切片或 map 等额外对象构造不属于“装箱本身”的成本，应另做对照，不要混在一个数字里。

## 四、真实成本只在两个地方

**1. 分配税**：装箱对象 ≥ 指针大小且逃逸 → 1 alloc。大 struct 装进 `any` 的场景（比如把请求体装箱统一处理），分配税随对象大小线性。修法：《[string ↔ []byte](/writing/go-string-byte-conversion)》和《[mallocgc 解剖](/writing/go-mallocgc-allocator)》同一句话——热路径传指针，别传大值。

**2. cache 税**：itab 间接跳转本身 1ns，但高频接口调用会打断内联链——方法体不能内联，每次调用是真正的函数调用 + 可能的指令 cache miss。测不测得到取决于方法体大小：方法体大、调用热，接口路径才显出劣势（仍是 1~5ns 量级，不是传说中"慢 10 倍"）。

## 五、生产判断：什么时候在乎接口性能

| 场景 | 判断 | 依据 |
|---|---|---|
| 常规接口设计（io.Reader、error） | 先按语义设计 | 当前短方法基线约 2ns，但实现数量和内联会改变路径 |
| 热路径接口方法调用（每秒百万级） | 考虑具体类型/泛型 | 打破内联链的 cache 税 + 无法内联 |
| 大对象装箱进 any | 传指针或改泛型 | 1 alloc + 拷贝税（当前 32B 基线 12.10ns） |
| 类型断言做类型分派 | 先确认动态类型 | 当前静态已知路径 0.31ns，不代表未知输入 |
| 泛型 vs any 参数 | 泛型略优 | 泛型实例化后是具体类型调用，无 itab |

泛型值得一提：`genericLen(i)` 实例化后就是 `int` 版本的具体代码——**泛型把接口的运行时开销转成编译期实例化**，这是 Go 1.18 之后"接口慢"问题的终极解：需要多态又在意性能时，泛型是 itab 的替代品。

## 六、结论：interface 的成本主要在大值分配，不在动态分派


interface 的账本比传说小得多：当前短方法基线约 2ns，标量装箱零堆分配，大值装箱才有 1 alloc。它真正卖的两样东西——方法的动态选择与类型无关的数据传递——成本分别是可能的间接跳转和大对象分配。今天的结论不是“interface 永远免费”，而是：**设计上先用接口表达职责，性能上只对真实热路径测去虚拟化、内联和大值装箱**。

下一步可做的事：在你代码的热循环里 grep `interface{}`/`any` 参数，凡是传入大 struct 的改指针或泛型；接口调用热点用 `-gcflags=-m` 检查是否有去虚拟化。

## 参考资料

1. Go 源码 `runtime/runtime2.go`（eface/iface）、`internal/abi/iface.go`（ITab）、`runtime/iface.go`（itab 缓存）—— Go 1.25.1 本机源码
2. Go 官方文档《Interfaces》—— https://go.dev/doc/effective_go#interfaces
3. 前作：[string ↔ []byte：零拷贝的边界](/writing/go-string-byte-conversion)、[mallocgc 解剖](/writing/go-mallocgc-allocator)

实验入口：`experiments/go-runtime-boundary/bench_test.go`（`BenchmarkDirectArea`、`BenchmarkInterfaceDispatch`、`BenchmarkInterfaceBox*`、`BenchmarkTypeAssertion`）；原始输出：`evidence/go-runtime-boundary/2026-08-16-local/raw/errors-interface-pool-map.txt`。类型断言的 0.31ns 只对应静态已知类型的特定基线。
