---
title: "ULID、三组脱敏正则与一把 XOR 盐：遥测层的隐私工程"
description: "源码行纪第七篇：结果上报之后发生什么——ULID 的生成方式、RedactIP 的四步脱敏流水线、XOR 盐混淆的诚实边界（注释自认非加密安全）、七种存储后端的工厂模式与 SQLite WAL。附混淆 ID 与 IP 脱敏的本机实测。"
publishedAt: "2026-08-26"
tags: ["Go", "测速", "源码阅读", "隐私"]
draft: false
featured: false
series: "LibreSpeed Go 源码行纪"
---

**TL;DR：** 遥测层（`results/` + `database/`）解决的是"测完之后数据去哪、怎么不惹麻烦"。四个机制各有明确的隐私立场：**ULID** 用时间戳+单调熵生成可排序的结果 ID；`redact_ip_addresses` 开关触发**四步正则脱敏流水线**，把 IPv4/IPv6/hostname 从上报内容里抹成占位符；ID 混淆用持久化盐对 ULID 前 4 字节做 XOR——注释诚实地写着"NOT cryptographically secure"，目标是防猜测而非防攻击；存储侧一个 `DataAccess` 接口挂七种后端，SQLite 默认开 WAL。本机实测：开启混淆后返回 base64url 形态的 ID 且 `/results/json` 能自动解码；内嵌假 IP 的上报在统计页全部变成 `0.0.0.0`。

## 一、Record：一次上报的完整旅程

第五篇看过它的接口形态；这篇拆内部。`results/telemetry.go:147-213` 的 `Record` 按序做五件事：

```text
1. database_type == "none" → 直接回答 "Telemetry is disabled"（隐私的第一道门是"不收集"）
2. 提取 RemoteAddr / User-Agent / Accept-Language / 七个 form 字段
3. RedactIP 开启 → 四步脱敏
4. 生成 ULID 作为记录主键
5. database.DB.Insert → 响应 "id <主键或混淆形式>"
```

注意第一步的设计：关闭遥测不是"存了但不给看"，而是**连写入都不发生**——PNG 结果卡与 JSON API 也随之失效（它们依赖数据库）。这是把隐私开关做成了数据流开关。

## 二、RedactIP：四步正则流水线

```go
// telemetry.go:166-174
if config.LoadedConfig().RedactIP {
	ipAddr = "0.0.0.0"
	ispInfo = ipv4Regex.ReplaceAllString(ispInfo, "0.0.0.0")
	logs    = ipv4Regex.ReplaceAllString(logs, "0.0.0.0")
	ispInfo = ipv6Regex.ReplaceAllString(ispInfo, "::")
	logs    = ipv6Regex.ReplaceAllString(logs, "::")
	ispInfo = hostnameRegex.ReplaceAllString(ispInfo, `"hostname":"REDACTED"`)
	logs    = hostnameRegex.ReplaceAllString(logs, `"hostname":"REDACTED"`)
}
```

四组正则（IPv4 / IPv6 / hostname）× 两份载体（ispinfo / log）。两个细节见功力：

1. **hostname 单独处理且保留 JSON 形状**：替换目标是 `"hostname":"REDACTED"` 而非裸值——直接抹字符串会破坏 JSON 结构，后续解析就崩了。脱敏必须理解载体的语法；
2. **IPv4/IPv6 双正则并行**，因为 ipinfo 的 processedString 里两者都可能出现。

本机实测（`evidence/librespeed-go-series/2026-08-26-local/evidence_obf.log`）：上报 `ispinfo={"processedString":"203.0.113.77 - TestNet, XX (12 km)","ip":"203.0.113.77"}` 后，登录统计台查看最近记录，页面中 `203.0.113.77` 出现次数为零、`0.0.0.0` 出现三次——包括 RemoteAddr 本身也被替换（回环场景下就是 127.0.0.1→0.0.0.0）。

## 三、ULID 与 ID 混淆：可排序的主键 + 可逆的伪装

**ULID**（`:192-195`）= 48 位毫秒时间戳 + 80 位单调熵，字典序即时间序——按时间翻页查询不需要额外索引列。生成用 `rand.NewSource(t.UnixNano())` 驱动的单调熵，保证同一毫秒内不重复。

**混淆**（`idobfuscation.go`）的目标写在注释里："prevents casual ID guessing, matching the PHP version's idObfuscation.php"，并且第一行就声明 **"This is NOT cryptographically secure"**。算法：

```text
salt = idObfuscation_salt.bin 里的 4 字节（不存在则 crypto/rand 生成并落盘，sync.Once 保证一次）
混淆 = ULID(16 字节) 前 4 字节 XOR salt → base64 RawURL 编码
还原 = 同一函数（XOR 自逆），所以 deobfuscateBytes 就是 obfuscateBytes 的别名
```

设计取舍非常清醒：只搅动前 4 字节就能让顺序遍历失效（时间前缀被盐打乱），成本近乎为零；代价是抗不住已知明文攻击——但威胁模型只是"别让扫描器枚举别人的测速结果"，不是对抗解密者。**安全措施与威胁模型对齐，比措施本身强大更重要**。

读取入口 `ResolveID` 先按裸 ULID 解析、失败再尝试解码混淆形态——两种 ID 在所有读端点（JSON/PNG/stats）通用。本机实测：开启混淆后上报返回 `id 9q5boPTnBPEwoCptYvww2Q`（base64url 形态，非 26 位 Crockford ULID）；把它原样喂给 `/results/json?id=…`，服务端自动解码命中记录。

## 四、存储：一个接口，七个后端

`database.go` 只定义了三个方法的接口：

```go
type DataAccess interface {
	Insert(*schema.TelemetryData) error
	FetchByUUID(string) (*schema.TelemetryData, error)
	FetchLast100() ([]schema.TelemetryData, error)
}
```

工厂函数按配置 switch 到 postgresql / mysql / sqlite / mssql / bolt / memory / none 七种实现。三个值得学的点：

1. **接口窄到极致**：只有测速平台真正需要的三种操作。没有 ORM、没有迁移框架、没有事务抽象；
2. **SQLite 用 modernc.org/sqlite 纯 Go 驱动**——零 cgo 是"单二进制扔进任何容器"目标的最后一块拼图；打开时顺手 `PRAGMA journal_mode=WAL`，写并发不再阻塞读；
3. **建表语句刻意对齐 PHP 版**（注释："matching the PHP SQLite auto-creation behavior"）：表名 speedtest_users、字段一一对应——两种语言实现可以共读同一个库，迁移路径因此存在。

none/memory 这两个"伪后端"同样体现接口价值：none 让整个遥测功能退化为空操作，memory 服务于测试与本篇的取证。

## 五、结论：隐私工程的四层防线

| 层 | 机制 | 立场 |
| --- | --- | --- |
| 收集前 | `database_type=none` 连写都不发生 | 不收集是最好的保护 |
| 入库前 | RedactIP 四步正则 | 存储的内容本身无害化 |
| 出口处 | ID 混淆（诚实标注非加密） | 防猜测，不对抗攻击 |
| 展示层 | stats 密码门 + 会话 cookie | 读也要过闸 |

下一步可验证的事：clone 项目后把 `enable_id_obfuscation` 和 `redact_ip_addresses` 打开，照本文 T1–T4 上报一条含假 IP 的记录——你会亲手看到混淆 ID 的 base64 形态，以及统计页里那三个 `0.0.0.0`。

## 参考资料

- `results/idobfuscation.go`、`results/telemetry.go` @ commit `59cff12`
- 实测档案：`evidence/librespeed-go-series/2026-08-26-local/evidence_obf.log`
- 站内相关：[接口手册](/writing/librespeed-go-05-interface)、[一份测速合同的全文](/writing/librespeed-go-04-contract)
