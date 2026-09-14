---
title: "Go fuzz 实战：0.4 秒抓到空 key，30 秒 970 万次确认修复"
description: "材质清单解析器先写单测再 fuzz：0.4 秒抓到 '=1' 空 key 漏网，修完语料入库回归，30 秒 970 万次零新增崩溃。用完整找修闭环说明 fuzz 在测试金字塔的位置。"
publishedAt: "2026-09-14"
tags: ["Go", "测试", "fuzz", "质量工程"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** 单测全绿的解析器，fuzz 0.4 秒抓到 `"=1"`——空 key 通过校验进了 `map[""]`。修（一行：`kv[0]==""` 拒绝）→崩溃语料入库→`go test` 回放通过→30 秒 970 万次零新增崩溃。全程本机。结论：fuzz 不是“更贵的单测”，它是“找你没想到要测什么”的环节；入库的崩溃语料才是真正的回归资产。

## 一、完整路径：一次 fuzz 找修闭环

```text
单测绿（5 个坏输入全拒）
  → go test -fuzz 0.4s → testdata 入库 "=1" 崩溃
  → 修：空 key 独立拒绝
  → 回放：FuzzParse/<hash> 通过
  → 30s / 9.7M execs：PASS，无新增
```

## 二、合同

| 维度 | fuzz 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 输入空间 | 覆盖人想不到的形状 | 穷尽 | 不变量先行（非法结果定义） |
| 回归 | 崩溃语料入库即永久用例 | 自动修 | 修 + 重跑 + 入库三连 |
| 成本 | 30 秒千万次（纯函数） | 有外部依赖时 | 被测体纯度（I/O 剥离） |

fuzz 函数体的写法是关键：只允许两类结局——受控 `badErr` 或合法结果；panic 与非法结果即红。不变量写多严，fuzz 就有多大用。

## 三、实测

`experiments/go-fuzz-parser/fuzz_test.go`（父模块，默认工具链），`evidence/go-fuzz-parser/2026-09-14-local/run.out`。崩溃语料 `testdata/fuzz/FuzzParse/4b062e0b6030ffd3` 随仓入库。

## 四、证据卡与边界

环境 Go 父模块工具链。不支持：长时间 fuzz（CI 夜间）、覆盖率导向细节、非纯函数目标。

## 参考资料

- Go 文档：fuzzing，<https://go.dev/doc/fuzz/>（2026-09-14 核对）
