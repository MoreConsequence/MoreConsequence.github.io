# Task 08 diagram redesign

本目录是 `librespeed-go-08-config-deploy.md` 的独立 dated evidence 与图表工作源。最终 SVG 由同目录的 `generate.mjs` 从 HTML 中抽取；HTML 是唯一编辑源。

## Four dials

- Format: `html+svg`（文章引用 SVG，HTML 保留可复核的内联 SVG）
- Size: `doc-inline`, `viewBox="0 0 960 600"`
- Detail: `balanced`
- Audience: `engineer`
- Variant: `static light`
- Skin: diagram-design 当前安装版本的默认 light tokens；仓库没有 `.diagram-design` marker，本批没有修改共享 style guide。

## Source boundary

- 项目源码固定为 `librespeed/speedtest-go @ 59cff12`。
- 直接运行 evidence 为 `evidence/librespeed-go-series/2026-08-26-local/`，环境是 Darwin/arm64、loopback、`127.0.0.1:8915`、`database_type=memory`。
- 该 evidence 明确没有覆盖 TLS/HTTP2、proxy protocol、Linux socket activation 或部署/生产流量。
- 官方源码中存在 Dockerfile、systemd unit/socket 与 `.goreleaser.yml`，图中只把它们当作仓库工件，不当作已运行的部署能力。

## Local verification record

本目录只记录本 worker 的局部检查；没有运行共享的 `npm test`、`npm run lint`、`npm run build` 或 `npm start`。

- [ ] `npm` 全站检查：按任务边界未运行，由主 Agent 合并后统一运行。
- [ ] Git commit/push/branch/deploy：未执行。
- [ ] HTML `self_check.py`：待生成工作源后运行并记录在交付消息中。
- [ ] SVG XML 解析与 `rsvg-convert`：待导出后运行并记录在交付消息中。

详细的事实、删减、合并和未证实项见 [fidelity-ledger.md](./fidelity-ledger.md)。
