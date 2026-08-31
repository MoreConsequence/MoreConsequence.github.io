# Fidelity ledger — diagram redesign 08

日期：2026-08-30  
文章：`content/posts/speedtest-engineering/librespeed-go-08-config-deploy.md`  
源码基线：`librespeed/speedtest-go @ 59cff12d1b95b3f80acd8a42b0156aa4fde440de`

## Facts used

### Configuration

- `config/config.go` 在 `init()` 中设置 `listen_port=8989`、`proxyprotocol_port="0"`、`statistics_password="PASSWORD"`、`database_type="postgresql"`、TLS/HTTP2 为 `false` 等默认值。
- `config.Load` 调用 `SetConfigFile(configPath)`、`SetEnvPrefix("speedtest")`、`AutomaticEnv()`、`ReadInConfig()`，随后 `Unmarshal(&conf)`。
- `main.go` 的 `-c` 只把一个路径传给 `config.Load`；该 commit 没有 `BindPFlag` 或把 CLI 配置值绑定到 Viper 的代码。因此图中把 CLI 标为 Viper 的通用能力/本应用未接入，而不是有效的最高优先级值源。
- Viper 1.10.1 的实现顺序是 override、flag、env、config、key/value、default；`AutomaticEnv` 文档同时限定为匹配已有 config/default/flag key。图中只突出本应用实际调用的 env、config、default 三层，并标注 matched key 边界。

### Runtime branches

- `web/web.go`：外置 `assets_path` 目录有效时使用 `justFilesFilesystem`；路径不存在或不是目录时记录 warning，改用 embedded `defaultAssets`。
- `web/listener.go`：TLS=false 且 HTTP2=true 时记录 `TLS is mandatory for HTTP/2` 并忽略 HTTP/2；TLS=true 时按 HTTP2 开关进入 TLS-only 或 TLS+HTTP/2 路径。
- `web/listener_linux.go`：0 个 systemd listener 回到地址监听，1 个 listener 使用继承 fd 且要求配置中的 bind/port 都为空，超过 1 个 listener 直接 Fatal。任务 08 的第一张图为了保持 balanced 密度聚焦资产和 TLS/HTTP2 分支；Linux/systemd 只在第三张图作为 source artifact 与未验证边界出现。

### Deployment evidence

- commit `59cff12` 的仓库包含 `Dockerfile`、`systemd/speedtest.service`、`systemd/speedtest.socket`、`.goreleaser.yml` 和 `settings.toml`。这些是可检查的仓库工件，不是部署成功、镜像运行、HPA、CDN 或生产容量的证据。
- `2026-08-26-local/README.md` 记录 Go 在 Darwin/arm64 上运行，配置监听 `127.0.0.1:8915`、`database_type=memory`，并且 assets 路径缺失时回退到默认内嵌 assets。
- 同一 README 明确写出本地 evidence 未覆盖 TLS/HTTP2、proxy protocol 路径；没有 Linux、Docker、Kubernetes、CDN 或生产拓扑实测。

## Per-image ledger

### `librespeed-go-config-deploy-graceful-downgrade.svg`

- Type: flowchart；主关系是源码决策 → 可回退结果/监听结果。
- Kept: `assets_path` 有效/无效两条路径；`HTTP/2 requested?` 与 `TLS enabled?` 的实际组合；`justFilesFilesystem`、embedded assets、`ListenAndServe`、`ListenAndServeTLS` 和错误日志/忽略语义。
- Merged: 同一监听函数中的 TLS-only 与 HTTP/1.1 结果按可读的结果节点合并；没有把平台分支和资产分支硬连成运行时顺序。
- Dropped: 原图的配置黑色代码块、未接入的 CLI 值覆盖、数据库“连不上自动降级 SQLite/None”、云原生镜像体积/HPA/高可用/99.999% 等无源码或无 evidence 支撑的断言。

### `viper-config-hierarchy-precedence.svg`

- Type: layer stack；主关系是配置来源的优先级向上收敛到 `Config struct`。
- Kept: 应用实际调用的 `AutomaticEnv`、`ReadInConfig`、`SetDefault`；`SPEEDTEST_<KEY>`、`settings.toml`、`-c` 只选路径、以及 `viper.Unmarshal(&conf)`。
- Merged: Viper 的通用 flags 能力与本应用 wiring 差异压缩成一层虚线 `CLI flags / not wired`，避免把 library feature 伪造成 speedtest-go 的配置值来源。
- Dropped: 原图虚构的 `--bind-address`、`--port`、`--telemetry-level`、YAML/`/etc/...` 搜索路径、12-Factor/Kubernetes 接入和“无配置仍安全稳定启动”等未由本 commit/evidence 建立的内容。

### `librespeed-go-cloud-native-deploy-topology.svg`

- Type: architecture / evidence boundary；主关系是 source artifacts → one local run，右侧是没有证据连接的边界。
- Kept: commit 中存在的 Dockerfile、systemd service/socket、goreleaser、settings/assets 工件；本地 Darwin/arm64 loopback 进程与 `database_type=memory`；本地观测到的 embedded-assets fallback。
- Merged: 所有未验证的外部目标压缩成一个明确标记的 `external runtime / not validated` 边界。
- Dropped: BGP Anycast、CDN、Kubernetes HPA、3→100 副本、100Gbps、Redis/PG 集群、15MB/零漏洞/秒启动/生产高可用等旧图文案。图中没有任何进入未验证区域的箭头。

## Source links

- [config/config.go at 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/config/config.go)
- [main.go at 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/main.go)
- [web/web.go at 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/web/web.go)
- [web/listener.go at 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/web/listener.go)
- [web/listener_linux.go at 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/web/listener_linux.go)
- [Dockerfile at 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/Dockerfile)
- [systemd/speedtest.service at 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/systemd/speedtest.service)
- [systemd/speedtest.socket at 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/systemd/speedtest.socket)
- [Viper 1.10.1 source](https://raw.githubusercontent.com/spf13/viper/v1.10.1/viper.go)
- [Viper configuration precedence documentation](https://github.com/spf13/viper#putting-values-in-viper)
