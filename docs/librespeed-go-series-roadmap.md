# 《LibreSpeed Go 源码行纪》系列路线图

以 `librespeed/speedtest-go`（commit 59cff12，2026-08-17，全量 21 个 `.go` 文件、2,371 行）为标本，
沿一条请求到结果的因果链，读懂一个可运行的自托管测速服务。与《你的带宽是怎么被算出来的》互为理论与实现两半。

## 篇目与状态

| # | slug | 核心问题 | 状态 |
| --- | --- | --- | --- |
| 01 | librespeed-go-01-overview | 从 main.go 到 garbage/empty/getIP：服务骨架与三个测量端点 | ✅ 已合并重写 |
| 02 | librespeed-go-03-client-ip | 从请求来源到结果记录：身份、隐私、ID 与存储 | ✅ 已合并重写 |
| 03 | librespeed-go-04-contract | 一次测速如何完成：Worker 合同、阶段、计量点与算法 | ✅ 已合并重写 |
| 04 | librespeed-go-05-interface | 从 URL 到监听入口：接口兼容、管理面、配置与部署边界 | ✅ 已合并重写 |

原 02、06、07、08 的内容已经分别并入以上四篇，旧文章源和无引用配图已删除。

## 取证基线

- 全部行号与数字实测于 commit 59cff12；运行取证存档 `evidence/librespeed-go-series/2026-08-26-local/`
- 关键锚点：garbage 默认 4 chunks×1MiB=4,194,304 字节；ckSize 上限钳制 1024（实测恰好 1 GiB）；
  前端 Worker 协议参数：test_order 默认 IP_D_U（无 P！）、6+3 流、grace 1.5s/3s、overhead ×1.06

## 规则

1. 文章中的行为断言（字节数、状态码、分类文案）必须能回到当前源码或 `evidence_run.log`；
2. 与 PHP 版行为的兼容点注明“兼容口径”，不当作 Go 版独立设计；
3. 不把 Darwin/arm64 loopback 结果写成公网、Linux 或生产证明。
