---
title: "从请求来源到结果记录：LibreSpeed Go 的身份、隐私与存储"
description: "把 getIP 的候选地址链、特殊地址短路、GeoIP 回退，以及遥测脱敏、ULID 混淆和 DataAccess 存储边界放进一条数据路径。"
publishedAt: "2026-08-26"
updatedAt: "2026-08-31"
tags: ["Go", "网络", "源码阅读", "隐私", "存储"]
draft: false
featured: false
series: "LibreSpeed Go 源码行纪"
---

**TL;DR：** `/getIP` 解决的是“如何展示这次请求来自哪里”，不是“如何信任这个请求”。LibreSpeed Go 先按固定顺序读取五个候选来源并逐个校验，再把特殊地址直接分类；只有需要且能够解释时，才走 ipinfo.io 与本地 mmdb 的 GeoIP 路径。测速结果进入 `Record` 后还要经过“是否收集、是否脱敏、如何编号、写入哪个后端”四个边界。代理头、XOR 混淆和本机取证都不能被扩大解释成安全认证或生产隐私保证。

## 一、先把“来源”与“信任”分开

`getClientIP` 的工作是从 HTTP 请求中找出一个可继续处理的候选值。它按源码顺序尝试：

```text
CF-Connecting-IPv6
  → Client-IP
  → X-Real-IP
  → X-Forwarded-For 的第一段
  → RemoteAddr
```

![LibreSpeed Go /getIP 请求处理：客户端候选 IP、特殊地址短路与 ISP 查询回退](../../../public/images/librespeed-go-client-ip-proxy-cgnat-lookup.svg)

每一级都会去空白、按需要截取 XFF 第一段，再用 `net.ParseIP` 检查格式；CF 这一项还要求结果确实是 IPv6。失败意味着继续降级，不会因为一个坏头让整个请求失败。IPv4-mapped IPv6 还会统一成点分形式，避免同一来源在后续分类中出现两种表示。

这条链的顺序是兼容合同，不是安全等级。客户端可以伪造这些请求头，因此它适合生成结果页上的说明，不适合决定“这个用户能不能访问管理接口”。真正的访问控制必须依赖受保护的认证信息，而不是 `getClientIP` 的返回值。

## 二、特殊地址先分类，公网地址才考虑外呼

拿到候选 IP 后，`classifyPrivateIP` 先处理不适合查询公网归属的地址：

| 分类 | 例子 | 处理 |
| --- | --- | --- |
| localhost | `::1`、`127.*` | 返回本地访问描述 |
| link-local | `fe80:*`、`169.254.*` | 直接分类 |
| 私有 IPv4 | `10.*`、`172.16–31.*`、`192.168.*` | 返回内网描述 |
| ULA IPv6 | `fc00::/7` | 位运算分类 |
| CGNAT | `100.64.0.0/10` | 返回运营商 NAT 描述 |

ULA 的判断可以直接写成：

```go
return ip[0]&0xFE == 0xFC
```

它检查 IPv6 首字节的前 7 位，不需要枚举 `fc00` 到 `fdff` 的前缀。CGNAT 则是跨多个十进制段的范围匹配，代码使用正则表达式。两者共同的设计点不是“哪种写法更高级”，而是先把地址语义确定下来，再决定是否调用外部服务。

公网地址且请求带 `isp=true` 时，代码才进入 GeoIP 路径：在线 ipinfo.io 优先，结果为空或失败时尝试本地 `.mmdb`，最后至少保留裸 IP。离线库要兼容 ipinfo 和 MaxMind 两套字段形态，否则“有 fallback”可能只是配置上存在、数据上不可用。

![classifyPrivateIP 的特殊地址匹配顺序：localhost、link-local、私网、ULA 与 CGNAT](../../../public/images/special-ip-subnet-classification-matrix.svg)

距离使用 haversine 计算；公里等单位还要经过既有的取整和文案规则，以保持与 PHP 前端的显示兼容。当前 dated evidence 主要覆盖 loopback 特殊地址，不能把一次本机回环结果当成公网 GeoIP 成功率。

## 三、遥测先过数据开关，再进入存储

`POST /results/telemetry` 不是把表单直接塞进数据库。`Record` 的有效路径可以压缩成：

```text
database_type == "none"  → 直接返回 Telemetry is disabled
                         ↓
提取请求元数据和表单字段
                         ↓
redact_ip_addresses?     → 替换 IP / hostname
                         ↓
生成 ULID
                         ↓
database.DB.Insert
```

![遥测从 Worker 上报、ULID 混淆到 ResolveID 读回结果的完整路径](../../../public/images/librespeed-go-telemetry-ulid-obfuscation.svg)

`redact_ip_addresses=true` 时，源码会处理请求地址以及 `ispinfo`、`log` 中的 IPv4、IPv6 和 hostname。hostname 替换要保持 JSON 片段形状，例如使用 `"hostname":"REDACTED"`，而不是把值随意删掉导致后续解析失败。脱敏是入库前的处理，不等于上游代理、应用日志或外部 GeoIP 服务已经全部匿名化。

## 四、ID 需要可查找，但不是安全令牌

结果 ID 的第一层是 ULID：时间戳加熵，使记录能够按时间排序。开启 ID 混淆后，代码用持久化 salt 对 ULID 的前 4 个字节做 XOR，再以 base64url 返回；读取时 `ResolveID` 可以还原它。

```text
obfuscated = ULID[0:4] XOR salt[0:4] + ULID[4:16]
```

这个设计解决的是“不要让人顺手枚举结果 ID”，不是密码学保密。源码注释明确写着 `NOT cryptographically secure`，所以不能把混淆后的 ID 当 bearer token 或授权证明。

存储端只暴露实际需要的三个操作：

```go
type DataAccess interface {
	Insert(*schema.TelemetryData) error
	FetchByUUID(string) (*schema.TelemetryData, error)
	FetchLast100() ([]schema.TelemetryData, error)
}
```

当前配置可选的实现可按语义分组：

| 类型 | 实现 | 适用边界 |
| --- | --- | --- |
| 外部 SQL | PostgreSQL、MySQL、MSSQL | 持久化服务 |
| 本地文件 | SQLite、Bolt | 单机部署 |
| 进程内 | memory | 测试和取证，重启丢失 |
| 空实现 | none | 明确关闭遥测写入 |

窄接口的价值在于结果处理不必知道具体数据库；代价也很明确：持久化、并发、备份和跨实例一致性仍由所选后端和部署者负责。

## 五、四个边界比“隐私已解决”更准确

这条数据路径只证明四件事：特殊来源可以短路、上报可以关闭、入库前可以脱敏、公开 ID 可以降低顺手猜测。它没有证明代理头可信、XOR 能抗攻击、外部日志已匿名，也没有证明七种后端在同一部署下具备相同的故障语义。

## 参考资料

- [librespeed/speedtest-go](https://github.com/librespeed/speedtest-go)，commit `59cff12`
- `web/getip_util.go`、`web/helpers.go`、`results/telemetry.go`、`results/idobfuscation.go`
- 本机取证：`evidence/librespeed-go-series/2026-08-26-local/evidence_obf.log`
- 系列相关：[一个测速点的最小闭环](/writing/librespeed-go-01-overview)、[Worker 合同与计量算法](/writing/librespeed-go-04-contract)、[接口兼容与部署边界](/writing/librespeed-go-05-interface)
