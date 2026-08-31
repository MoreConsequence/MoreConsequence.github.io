# LibreSpeed Go 图表重绘批次 04

本目录只记录 `librespeed-go-04-contract.md` 的三张现有图片重绘。工作源是三个 HTML 文件；`generate.mjs` 按 diagram-design 的 SVG 导出规则提取第一个 `<svg>`，保留可访问性属性，注入 XML 安全的 Google Fonts `@import`，再写回仓库 `public/images/` 中对应的 SVG。

## 固定参数

- 类型：Worker 合同图使用 Sequence；遥测 ID 图与上下行计量图使用 Architecture。
- 语义：Worker 图以生命周期终态为主轴；ID 图以可逆混淆/查找边界为主轴；计量图以方向不同的观测点为主轴。
- 尺寸：`doc-inline`，`viewBox="0 0 960 600"`。
- 细节：`balanced`；读者：`engineer`；样式：静态 light、无脚本。
- 共同视觉约束：4px 网格、浅色纸面、无阴影和暗色代码块、正交圆角连接、箭头标签遮罩、底部水平图例、`role="img"` + 前置 `<title>`/`<desc>`。

## 事实范围

- 源码标本：`/Users/lianghaoyu/codes/speedtest-go`，`HEAD = 59cff12d1b95b3f80acd8a42b0156aa4fde440de`。
- Worker：`web/assets/speedtest_worker.js` 的默认 `test_order="IP_D_U"`、`start/status/abort`、D/U 端点、`sendTelemetry` 与 `testState=4/5`；主线程 `web/assets/speedtest.js` 的 `state=2` 表示测速点已选、可开始测试。
- Go 端：`web/web.go` 的 `/empty(.php)`、`/garbage(.php)`、`/getIP(.php)`、`/results/telemetry(.php)` 路由及 `empty`/`garbage` handler；`results/idobfuscation.go` 与 `results/telemetry.go` 的 ID 变换和记录流程。
- 直接运行记录：`../../2026-08-26-local/evidence_run.log`、`evidence_session.log`、`evidence_obf.log`。它们只覆盖本机 `darwin/arm64` loopback，不构成公网、代理、TLS/HTTP2、容量、反刷或生产 SLO 证据。

## 导出与局部检查记录

导出命令：

```sh
node evidence/librespeed-go-series/2026-08-30-diagram-redesign-04/generate.mjs
```

已运行并通过：

- `python3 /Users/lianghaoyu/.codex/skills/diagram-design/scripts/self_check.py <each HTML>`：三份 HTML 均 `OK`。
- `xmllint --noout <three exported SVGs>`：三份 SVG 均为 well-formed XML。
- `rsvg-convert -o rendered/<name>.png <name>.svg`：三份 SVG 均成功渲染；PNG 仅作本地视觉复核证据，不是文章引用资产。
- 专属静态检查：确认每张图只有一个 SVG、`viewBox=0 0 960 600`、完整 slug 前缀的 `title/desc`、4px 网格、无对角连接、无 `script/filter/box-shadow/foreignObject` 及虚构的安全/性能口号；三份均通过。
- 目标范围 `git diff --check` 与 evidence/文章/三张图片的尾随空白检查均通过。

未运行/不可用：仓库没有 `scripts/verify-geometry.py`；当前环境没有 Python Playwright/Chromium，因此未执行浏览器自动化截图检查。没有运行共享的 `npm test`、`npm run lint`、`npm run build` 或 `npm start`，也没有执行 Git commit、push、branch 或 deploy。
