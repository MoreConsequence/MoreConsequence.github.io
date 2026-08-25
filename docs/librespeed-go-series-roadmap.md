# 《LibreSpeed Go 源码行纪》系列路线图

以 `librespeed/speedtest-go`（commit 59cff12，2026-08-17，全量 21 个 .go 文件、2,371 行）为标本，
逐层读穿一个"能跑的生产级测速服务"。与《你的带宽是怎么被算出来的》互为理论与实现两半。

## 篇目与状态

| # | slug | 核心问题 | 状态 |
| --- | --- | --- | --- |
| 01 | librespeed-go-01-overview | 27 行 main.go 怎么长成一个完整服务：全景地图 + 本机运行取证 | ✅ 已发布 |
| 02 | librespeed-go-02-endpoints | 下行/上行/延迟三端点的服务端真相（garbage/empty/ckSize 钳制） | ✅ 已发布 |
| 03 | librespeed-go-03-client-ip | 五级代理头链、私网分类的位运算、ipinfo+MaxMind 双源回退 | ✅ 已发布 |
| 04 | librespeed-go-04-telemetry | ULID、RedactIP 脱敏正则、ID 混淆 salt 文件、7 后端工厂与 WAL | 待写 |
| 05 | librespeed-go-05-config-deploy | viper 默认值陷阱（database_type 默认 postgresql）、TLS/HTTP2 组合矩阵、proxy protocol | 待写 |

## 取证基线

- 全部行号与数字实测于 commit 59cff12；运行取证存档 `evidence/librespeed-go-series/2026-08-26-local/`
- 关键锚点：garbage 默认 4 chunks×1MiB=4,194,304 字节；ckSize 上限钳制 1024（实测恰好 1 GiB）；
  while 循环无——单文件函数平铺；agent 无关

## 规则

1. 每篇引用的行号必须在写作当日对当前 commit 复核一次；
2. 涉及行为断言（字节数、状态码、分类文案）必须有 evidence_run.log 对应条目；
3. 与 PHP 版行为的兼容点必须注明"兼容口径"，不当作 Go 版独立设计。
