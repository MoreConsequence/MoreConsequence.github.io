---
title: "Go 1.27 标准库两新件：有序 uuid 与后量子签名"
description: "uuid.NewV7 前 48 位是 unix 毫秒（跨毫秒有序、同毫秒不保证单调），crypto/mldsa 签验闭环（公钥 1952B、签名 3309B）。两组断言全过，同一主题：标准库替你接 formerly-第三方依赖。"
publishedAt: "2026-09-14"
updatedAt: "2026-09-16"
tags: ["Go", "标准库", "UUID", "密码学"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** Go 1.27 把两个第三方领地收编进标准库：`uuid.NewV7` 前 48 位是 unix 毫秒——隔 15ms 的两个必有序；Go 实现更进一步（源码确认）：12 位亚毫秒分量加同值递增兜底，同一进程连发 5000 个严格递增，仅系统时钟回拨打破（RFC 本身不保证，跨实现不保证）。`crypto/mldsa`（FIPS 204）签验闭环、篡改与错钥双拒绝，代价是公钥 1952B、签名 3309B。两组断言全过（5+4）。

## 一、uuid：版本位、往返、唯一、有序

```
xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
```

v7 版位（RFC 9562 §5.7）：第 13 个十六进制位恒 `7`，变体位 `y ∈ {8, 9, a, b}`——版本 nibble 与变体位断言锁的就是这两处。36 字符往返恒等、万级零碰撞、跨毫秒 `Compare < 0`、连发 5000 严格递增（`experiments/go127-uuid/uuid_test.go`），5 PASS。选型一行：对外不可推测用 v4，数据库主键用 v7；要跨进程/跨语言的严格单调仍用序列（单调是 Go 实现的选择，不是 RFC 合同）。

## 二、mldsa：闭环易，体积贵

`GenerateKey(MLDSA65)` → `Sign` → `Verify` 通过；一字节篡改与错钥双双拒绝；`SignDeterministic` 同输入稳定；三档尺寸实测 44（1312/2420）、65（1952/3309）、87（2592/4627）（`experiments/go127-mldsa/mldsa_test.go`），5 PASS。Ed25519（32B/64B）对比下 60/50 倍体积——先试点长期存档签名，别换高频令牌。

## 三、证据卡与边界

原始输出：`evidence/go-uuid-v7/`、`evidence/go-mldsa/`（2026-09-14-local）。不支持：B-tree 真实插入性能、X.509 集成、跨实现互操作。

## 参考资料

- Go 1.27 发布说明，<https://go.dev/doc/go1.27>；RFC 9562（UUIDv7 时间排序），<https://www.rfc-editor.org/rfc/rfc9562.html>；FIPS 204（ML-DSA），<https://csrc.nist.gov/pubs/fips/204/final>（2026-09-14 核对）
- 非标准库对照实现：google/uuid，<https://pkg.go.dev/github.com/google/uuid>
