# LibreSpeed Go 图表重绘取证：任务 03

## 范围

- 目标文章：`content/posts/speedtest-engineering/librespeed-go-03-client-ip.md`
- 只重绘文章当前引用的三张 SVG；不修改文章正文、metadata 或其他文章/图片。
- 事实源：`librespeed/speedtest-go` @ commit `59cff12`，并以文章现有的本机取证作为行为补充。
- 生成 Skill：`/Users/lianghaoyu/.codex/skills/diagram-design/`
- 生成日期：2026-08-30

## 设计参数

- 输出用途：博客正文内嵌 SVG
- 工作源：三个自包含 HTML 文件
- 尺寸：`doc-inline`，`960 × 600`
- 细节：`balanced`
- 读者：`engineer`
- 变体：静态 light，无动画
- 皮肤：当前 diagram-design 默认 light tokens；仓库已经存在同批次图表产物，因此未启动首次项目皮肤询问。

## 图表映射

| 资产 | 类型 | 主关系 |
| --- | --- | --- |
| `librespeed-go-client-ip-proxy-cgnat-lookup` | Flowchart | `/getIP` → `getClientIP` → `classifyPrivateIP`；特殊地址短路；`isp=true` 后进入 API → mmdb → 展示结果分支 |
| `client-ip-five-level-proxy-chain` | Sequence | `getClientIP` 按 1→5 读取候选值；每组候选交给 `normalizeCandidateIP`；无效值继续，`RemoteAddr` 最后兜底 |
| `special-ip-subnet-classification-matrix` | Flowchart + ordered table | `classifyPrivateIP` 的源码 switch 顺序、匹配表达式和返回描述；命中返回非空描述，未命中返回空串 |

## 直接事实边界

- `getClientIP` 的候选顺序、`CF-Connecting-IPv6` 的 IPv6 专用校验、XFF 首段、`RemoteAddr` 解析和 `TrimPrefix("::ffff:")`：
  [web/getip_util.go @ 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/web/getip_util.go)
- `/getIP` 先调用 `getClientIP`，命中特殊地址立即返回；否则只有 `isp=true` 才调用 ISP 查询，空查询结果在展示层变成 `Unknown ISP`：
  [web/web.go @ 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/web/web.go)
- `getISPInfoByPriority` 先调 ipinfo.io，再查配置的离线 GeoIP 数据库，最后返回空结果：
  [web/helpers.go @ 59cff12](https://raw.githubusercontent.com/librespeed/speedtest-go/59cff12/web/helpers.go)
- 本机回环取证只证明 `127.0.0.1` 被分类为 `localhost IPv4 access`；它不证明代理拓扑、公共网络出口或线上 ISP 结果：
  `evidence/librespeed-go-series/2026-08-26-local/evidence_run.log`

## 生成链

```text
*.html（本目录内的 Skill 工作源）
  → export.mjs（按 export.md 提取第一个 <svg>，合并 XML-safe Google Fonts @import）
  → public/images/*.svg（文章引用的最终资产）
```

`export.mjs` 是导出辅助脚本；HTML 仍是图表的编辑源。未生成 PNG，未运行共享 npm 检查。

## 验证记录

本文件在局部验证完成后补写实际命令、结果和不可用检查；全站 `npm test`、`npm run lint`、`npm run build` 与部署不在本 worker 范围内。
