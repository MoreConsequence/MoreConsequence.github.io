---
title: "错误链的账本：查询每层 3.6ns，包装一次 125ns，税在构造不在遍历"
description: "errors.Is 遍历错误链每层只需 3.6ns（10 层链 36.8ns 实测），查询成本低到可以忽略——真正的税在包装那一刻：fmt.Errorf(\"%w\") 一次 125.6ns/64B/3 allocs（格式化+包装结构），errors.Join 22.7ns。深层链的恐惧是误导：深链查询便宜、浅链构造贵。结论：热路径别用 %w 格式化包装（用哨兵常量+直接比较 2ns），错误链别怕深但别每层重新格式化。本机实测 Go 1.25.1。"
publishedAt: "2026-08-16"
updatedAt: "2026-08-16"
tags: ["Go", "错误处理", "性能优化"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 错误链的成本分配与直觉相反：**查询便宜、构造贵**。本机实测（Go 1.25.1）：`errors.Is` 遍历 10 层链只要 **36.8ns**（每层约 3.6ns，线性），直接比较哨兵 2ns——深链的恐惧是误导；而 `fmt.Errorf("%w")` 每包装一次要 **125.6ns/64B/3 allocs**（字符串格式化 + 包装结构分配），`errors.Join` 22.7ns。结论：① 热路径返回错误用哨兵常量直接比较，别格式化；② 链的深度无所谓（10 层 37ns），每层是否重新格式化才有所谓（每层 125ns）；③ `%w` 的账全部在包装时刻支付，不在检查时刻。

## 一、Is 的实现：循环解链，一次类型断言

`errors.Is`（errors/wrap.go:44）的实现是教科书级的简单循环：

```go
func is(err, target error, targetComparable bool) bool {
	for {
		if targetComparable && err == target {   // 1. 先比哨兵
			return true
		}
		if x, ok := err.(interface{ Is(error) bool }); ok && x.Is(target) {
			return true                          // 2. 自定义 Is 方法
		}
		switch x := err.(type) {                 // 3. 解链
		case interface{ Unwrap() error }:
			err = x.Unwrap()                     //   单链
		case interface{ Unwrap() []error }:
			for _, err := range x.Unwrap() {     //   多链（errors.Join）
				if is(err, target, ...) { return true }
			}
			return false
		default:
			return false
		}
	}
}
```

每轮循环 = 一次 `==` + 一两次类型断言 + 一次解链——实测每层 **3.6ns**。这就是为什么 10 层链也只 36.8ns：**链的深度不是成本，遍历是"比较次数"的事**。真正要警惕的是另一头：构造。

## 二、实测：查询线性、构造昂贵

| 操作 | ns/op | B/op | allocs |
|---|---|---|---|
| 直接比较哨兵 `err != nil && err == sentinel` | 2.0 | 0 | 0 |
| `errors.Is`（无链） | 4.8 | 0 | 0 |
| `errors.Is` 1 层链 | 7.9 | 0 | 0 |
| `errors.Is` 3 层链 | 15.2 | 0 | 0 |
| `errors.Is` 10 层链 | **36.8** | 0 | 0 |
| `errors.New` | 0.32 | 0 | 0 |
| **`fmt.Errorf("%w")` 一次包装** | **125.6** | 64 | **3** |
| `errors.Join` 两个错误 | 22.7 | 32 | 1 |

读法：Is 每层 3.6ns 线性增长、零分配；而**一次 `%w` 包装 = 三次 Is 查询十层链**。热路径上每个错误经过 3 层包装，检查时 15ns，包装时已经花掉 377ns 和 9 个分配——**账全在包装时刻**。`errors.New` 的 0.32ns 与 `%w` 的 125.6ns 之间差着格式化：`fmt.Errorf` 要解析格式串、拼接上下文、分配包装结构。

## 三、语义与性能的双重判断：Is 与 As 各买什么

`errors.Is` 卖的是**值语义**：链上有没有一个**相等**于 target 的错误（哨兵、自定义 Is）。`errors.As` 卖的是**类型语义**：链上有没有**类型匹配**的节点（对应 reflectlite 类型遍历，无匹配时实测 82.7ns/1 alloc，比 Is 贵——类型断言路径不能走 `==` 快路）。

| 需求 | 用 | 成本 |
|---|---|---|
| "这个错误是不是哨兵 X" | `errors.Is` | 4.8ns + 3.6ns/层 |
| "错误码是多少"（自定义类型） | `errors.As` | ~82ns |
| 热路径最简判断 | 直接比较哨兵 | 2ns |
| 组合多个错误来源 | `errors.Join` | 22.7ns |

**Join vs %w 的选择也是性能选择**：Join 不做格式化（22.7ns vs 125.6ns），但只做"聚合"不做"上下文"。语义上两者都解链——`%w` 是"链 + 人话"，Join 是"纯链"。热路径上要链不要人话，用 Join。

## 四、生产判断：错误链的设计规则

1. **热路径返回错误：哨兵 + 直接比较**。日志/框架层想包装就包装，业务热循环里 `%w` 包装是一次 125.6ns/3 allocs 的税，每层都包等于把税乘链长。
2. **链可以深，但要纯**。10 层 37ns 的查询不是问题；问题在 10 层 × 125.6ns = 1.2µs 的构造。用 `errors.Join` 或自定义 `Unwrap` 保持构造便宜。
3. **检查一次 vs 每层检查**：Is 停在第一个匹配（target 在上层就快），把常见错误包在表层。
4. **fmt.Errorf 的 `%v` 不是 `%w`**：`%v` 只拼字符串不建链（更便宜但不解链）——要链就用 `%w` 或 Join，别混用。

## 结论

错误链的性能真相：**查询是便宜的一方（3.6ns/层，10 层 37ns），构造是贵的一方（%w 一次 125.6ns/3 allocs）**。设计推论：链深不可怕，包装热不可取；哨兵 + 直接比较（2ns）是热路径的默认答案，`errors.Join` 是"要链不要人话"时的最优解，`%w` 留给日志边界层。本系列反复出现的同一句式：**优化发生在分配点，不是检查点**。

下一步可做的事：在代码里 grep `fmt.Errorf`，凡是热路径（每请求多次）上带 `%w` 的，改成哨兵/Join；用 `errors.Is` 的深链对照本表验证你的链的查询成本。

## 参考资料

1. Go 源码 `errors/wrap.go`（Is/is/As/as）、`errors/join.go`（Join）—— Go 1.25.1 本机源码
2. Go 官方博客《Error handling and Go》—— https://go.dev/blog/error-handling-and-go
3. 前作：[mallocgc 解剖](/writing/go-mallocgc-allocator)、[benchmark 的七宗罪](/writing/go-benchmark-pitfalls)