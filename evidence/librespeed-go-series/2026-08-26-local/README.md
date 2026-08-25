# evidence/librespeed-go-series/2026-08-26-local

《LibreSpeed Go 源码行纪》系列的源码与运行取证。

## 环境

- 项目：librespeed/speedtest-go @ commit `59cff12`（2026-08-17，依赖升级）
- Go 构建并运行于 darwin/arm64；配置 `settings.toml`（127.0.0.1:8915，database_type=memory）

## 文件清单

- `measure` 相关命令见 `evidence_run.log`：garbage 字节数(默认 4MiB/ckSize=1 恰 1MiB/99999 钳到 1024 chunks=1GiB)、
  /empty ping 亚毫秒、POST 10MB 上行 sink、getIP 回环私网分类、telemetry 返回 ULID、stats 密码门
- `server.log`：启动日志（ipinfo.io 取服务器坐标成功、默认 assets 回退警告）

## 边界

- 全部为 loopback 本机行为；未覆盖 TLS/HTTP2/proxy protocol 路径；
- getIP 的 ipinfo.io 外呼在启动时发生一次（取服务器坐标），测试期外呼未逐条记录。
