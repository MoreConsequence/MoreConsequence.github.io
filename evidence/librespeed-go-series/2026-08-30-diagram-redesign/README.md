# LibreSpeed Go 图表重绘取证

## 范围

- 目标文章：`content/posts/speedtest-engineering/librespeed-go-01-overview.md`
- 事实来源：`librespeed/speedtest-go` @ commit `59cff12`
- 本机行为证据：`evidence/librespeed-go-series/2026-08-26-local/`
- 生成 Skill：`/Users/lianghaoyu/.codex/skills/diagram-design/`
- 生成日期：2026-08-30

## 设计参数

- 输出用途：博客正文内嵌 SVG
- 工作源：三个自包含 HTML 文件
- 尺寸：`doc-inline`，`960 × 600`
- 细节：`balanced`
- 读者：`engineer`
- 变体：静态 light，无动画
- 配色：沿用当前博客的暖纸张、深色文字、深蓝链接和单一珊瑚焦点

## 图表映射

| 资产 | 语义类型 | 保留的主关系 |
|---|---|---|
| `librespeed-go-architecture-overview-pipeline` | Architecture | 浏览器 → 单二进制 → web → results → database；main.go → config → web |
| `librespeed-go-package-dependency-graph` | Layer Stack | main.go、config、web、results、database 的五层源码职责 |
| `librespeed-go-multi-mount-routing-table` | Route convergence | 原生、`/backend/`、`.php` 三类 URL 直接挂到同一 Handler |

## 有意删减

- 删除旧图中的深色代码块、阴影、点阵背景和四列等宽卡片。
- 删除旧图中的并发、10Gbps、Slowloris、零拷贝、异步写入和“100% 兼容”等未由本篇证据直接支持的图内断言。
- 将旧的“package dependency graph”重写为源码职责分层；当前图没有虚构未核对的 package edge。
- 将旧的“routing matrix”重写为多路径收敛图；不把兼容路径描述成重定向。
- 文章正文已有的非图表事实未在本批次扩大修改范围。

## 生成链

```text
generate.mjs
  → *.html（Skill 工作源）
  → 提取第一个 <svg>
  → 注入 XML 声明与 Google Fonts @import
  → public/images/*.svg（文章资产）
```

## 验证结果

- `python3 /Users/lianghaoyu/.codex/skills/diagram-design/scripts/self_check.py`：三个 HTML 工作源通过。
- `xmllint --noout`：三个 SVG 通过 XML 解析。
- 手工几何检查：三个 SVG 的 off-axis 连接均为圆角路径；直线连接均为水平或垂直；均包含 `role="img"`、`aria-labelledby`、带前缀的 `<title>` / `<desc>`；未发现 `feDropShadow`、`card-shadow` 或 `#0f172a`。
- `npm test`：12 个 test files、45 个 tests 通过。
- `npm run lint`：0 errors；保留仓库原有 `components/post/mermaid-renderer.tsx:391` 的一条 `@next/next/no-img-element` warning。
- `npm run build`：Next.js 静态导出成功，目标页面进入 `out/writing/librespeed-go-01-overview/index.html`。
- 独立静态预览：`http://localhost:50462/writing/librespeed-go-01-overview/` 返回 200，三张 SVG 返回 200，截图检查通过，浏览器控制台无 error/warning。
- 原有 `http://localhost:3000/` 进程未停止；它在本轮期间缓存了旧 Markdown 页面，静态导出端口已验证最新 source。线上 GitHub Pages 未验证，也未执行 commit、push 或部署。
- `npm run audit:content` 与 `npm run audit:evidence` 的退出码为 0，但脚本只枚举 `content/posts/` 根目录下的 Markdown，而本仓库文章位于分类子目录，因此输出 `Posts: 0`，本批次不把它们计入有效审计证据。
