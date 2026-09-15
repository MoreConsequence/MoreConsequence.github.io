---
title: "Go 1.27 标准库两新件：有序 uuid 与后量子签名"
description: "uuid.NewV7 前 48 位是 unix 毫秒（跨毫秒有序、同毫秒不保证单调），crypto/mldsa 签验闭环（公钥 1952B、签名 3309B）。两组断言全过，同一主题：标准库替你接 formerly-第三方依赖。"
publishedAt: "2026-09-14"
tags: ["Go", "标准库", "UUID", "密码学"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** Go 1.27 把两个第三方领地收编进标准库：`uuid.NewV7` 前 48 位是 unix 毫秒——隔 15ms 的两个必有序，同毫秒后缀随机故**有序非严格单调**；`crypto/mldsa`（FIPS 204）签验闭环、篡改与错钥双拒绝，代价是公钥 1952B、签名 3309B。两组断言全过（4+4）。

## 一、uuid：版本位、往返、唯一、有序

版本 nibble 与 RFC 变体位断言、36 字符往返恒等、万级零碰撞、跨毫秒 `Compare < 0`（`experiments/go127-uuid/uuid_test.go`），4 PASS。选型一行：对外不可推测用 v4，数据库主键用 v7，要严格单调用序列。

## 二、mldsa：闭环易，体积贵

`GenerateKey(MLDSA65)` → `Sign` → `Verify` 通过；一字节篡改与错钥双双拒绝；`SignDeterministic` 同输入稳定（`experiments/go127-mldsa/mldsa_test.go`），4 PASS。Ed25519（32B/64B）对比下 60/50 倍体积——先试点长期存档签名，别换高频令牌。

## 三、证据卡与边界

原始输出：`evidence/go-uuid-v7/`、`evidence/go-mldsa/`（2026-09-14-local）。不支持：B-tree 真实插入性能、X.509 集成、跨实现互操作。

## 参考资料

- Go 1.27 发布说明，<https://go.dev/doc/go1.27>；RFC 9562；FIPS 204（2026-09-14 核对）
