---
title: "Go 1.27 crypto/mldsa：签验闭环与 1952B 公钥的代价"
description: "ML-DSA-65 签验闭环、篡改与错钥双拒绝、确定性签名稳定，公钥 1952B、签名 3309B。用 4 测试锁定，并说明后量子签名的体积代价与适用边界。"
publishedAt: "2026-09-14"
tags: ["Go", "密码学", "PQC", "标准库"]
draft: false
featured: false
series: "Go 的设计边界"
---

**TL;DR：** Go 1.27 标准库 `crypto/mldsa`（FIPS 204）：`GenerateKey(MLDSA65)` → `Sign` → `Verify` 闭环通过，篡改一字节与错钥双双拒绝，`SignDeterministic` 同输入稳定。代价是体积：公钥 1952B、签名 3309B——是 Ed25519（32B/64B）的 60/50 倍。4 测试全过。结论：先在“需长期抗量子存档”（固件签名、证书）试点，别急着换高频 API 令牌。

## 一、合同

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 安全 | FIPS 204 ML-DSA，CSPRNG 密钥 | 量子计算机时间表 | 算法敏捷性（保留迁移口） |
| 体积 | 固定尺寸（65：1952/3309） | 装进现有字段（DB 列、JWT 长度） |  schema 与传输预算重估 |
| 确定性 | `SignDeterministic` 同输入同输出 | 默认 `Sign` 随机化（防侧信道） | 按场景选：测试用确定，生产用随机 |
| 可用性 | 非 FIPS 模块下可用 | FIPS 140-3 Go 模块 v1.0.0 下可用（显式返回错误） | 合规环境的模块版本核对 |

## 二、实测

`experiments/go127-mldsa/mldsa_test.go`，`evidence/go-mldsa/2026-09-14-local/run.out`，4 PASS。

## 三、证据卡与边界

环境 Darwin arm64 + go1.27.1。不支持：X.509/TLS 集成、跨实现互操作、性能 benchmark。

## 参考资料

- Go 1.27 发布说明（mldsa 节），<https://go.dev/doc/go1.27>
- FIPS 204，<https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.204.pdf>
