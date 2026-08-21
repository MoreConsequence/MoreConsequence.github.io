# 2026-08-21 全站纸本化重构设计

状态：已获用户确认（全盘纸本化 + 站名 Boundary Notes）

## 背景与动机

用户对现有站点不满意，明确的痛点：

1. 主题切换菜单看不清：`.theme-menu` 用半透明玻璃底 + `backdrop-filter: blur(24px)`，滚动时底层正文穿透到菜单内，配合 0.56rem 的 mono 小字 = 糊成一片。
2. 排版布局没有真正改变：header 只改了局部样式，hero 仍是 SYSTEM/STATUS 赛博面板，卡片仍是玻璃 + 渐变 + 光晕，标题仍是 700 粗字 + mono 数字。
3. 大量不符合 kami 纸感规范：渐变光晕、电蓝 accent、粗体、半透明 rgba 标签、20px 大圆角硬阴影、大写 SYSTEM 风格标签。

用户已确认方向：**全盘纸本化**，站名改为「边界笔记 / Boundary Notes」，hero 采用纸本封面式。

## 遵循的规范（kami 设计语言）

- 页面底色 `#f5f4ed` 羊皮纸，绝不纯白
- 唯一 accent：墨蓝 `#1B365D`
- 全部灰色暖调（黄褐底色，无冷蓝灰）
- 全页单一衬线字体，`--sans = var(--serif)`，字重锁定 500 无 bold
- 行距：标题 1.1-1.3，正文 1.5-1.55
- 中文衬线：TsangerJinKai02 / Source Han Serif SC / Noto Serif CJK SC / Songti SC / STSong / KaiTi
- 标签实底 hex（不用 rgba，规避 WeasyPrint 双矩形 bug）
- 深度靠 ring / whisper shadow，不用硬投影
- 无 italic
- 层级靠字号差异取胜，不靠边框、粗体或光晕

## 变更范围

### A. 全局基底 (`--root` 令牌 + 字体)

- `:root` 默认令牌直接改为纸系：`--background #f5f4ed`、`--accent #1b365d`、暖灰 muted、细线 border
- `--font-display` / `--font-sans` 全局改衬线栈；`--font-mono` 保留给真正的 UI chrome（代码块、kbd、URL）但不再做主信息载体
- 删除 body 三团径向渐变光晕与半透明玻璃依赖；`body::after` 光晕层替换为纯色纸底或移除
- 所有 `--glass-*` 令牌保留定义（兼容其余组件），但主要视觉载体改为实底 surface 色

### B. 主题菜单 / 导航实底化

- `.theme-menu`：`background: var(--glass-bg-strong)` + blur → `background: var(--surface)` 实底 + `border: 1px solid var(--border)` + whisper shadow
- 菜单字号：option 0.8rem → 衬线；small 0.56rem → 0.7rem，保底可读
- `.theme-switcher-trigger`：去 glass, 改实底 + 细边框
- `.primary-nav a`：去胶囊 hover 背景，改墨蓝下划线指示；hover 淡墨蓝底仅轻微
- `.site-header`：去渐变下边光晕，改 1px 细线 + 顶部 2px 墨蓝页眉线（呼应 paper book）

### F. 品牌改名 Boundary Notes

- `lib/site.ts`：`name: "边界笔记 · Boundary Notes"`, `shortName: "边界笔记"`, `author` 改为站点名, description 同步
- `components/site/site-logo.tsx`：印章 mark 改为「界」字，字标改为「边界笔记 / BOUNDARY NOTES」小字
- `components/site/site-footer.tsx`：`© 年 Boundary Notes`
- `app/about/page.tsx`：去掉人名 HaoYu
- `app/layout.tsx`：og alt 文案改站名
- `/README.md`：标题改站名
- `tests/layout.test.tsx`：断言同步
- 保留 `HaoYu` 作为隐私阻力位——用户要求完全去掉个人名

### C. 首页 hero 纸本封面式

- 删除 `.hero-panel`（SYSTEM/STATUS 面板、panel-led、panel-scan 扫描动画）与 `.hero-spec`（SYSTEM ONLINE 规格带）
- 新 hero：顶部小行眉（如 "Boundary Notes · 持续写作"）→ 大字标题 serif 500 → 副文案 → 一行统计（篇数/系列数/主题数，serif 数字 + 小标签）
- 上下细线收边，无玻璃、无网格背景

### D. 卡片体系实底化

- `.featured-grid .post-card` / `.latest-list .post-card` / `.archive-posts .post-card` / `.tag-index > a`
  - 统一实底 `--surface`（或 `--surface-strong`）
  - 去 `backdrop-filter`，去渐变高光条（`::before`）、去径向光晕（`::after`）
  - 圆角 20px → 8-12px
  - 阴影改 whisper（如 `0 1px 2px` 级别）
  - hover：轻微上移 + 左侧 2px 墨蓝细线（border-left）
- 标题 700 → 500；数字 mono → serif；`tag-list` rgba → 实底 hex；`post-meta` 从 mono 小字改衬线可读

### E. 正文区纯化

- `.article-prose h2`：去顶部粗线 + 阴影，改细线或纯留白层级
- `blockquote`：去玻璃底，改 2px 墨蓝左条 + 无底
- `code/pre`：实底 ivory 纸面，无 border 或细 border
- `table`：细线、表头 500

### G. 归档/标签/关于/404 同步

- 各页面统一应用纸 token 与细线分隔，去掉玻璃 / mono 大写标签 / 硬光晕
- `.article-kicker`, `.article-header-meta`, `.article-header` 改衬线

### 验证

- `npm test`（更新 tests/layout.test.tsx 断言）
- `npm run lint`
- `npm run build`
- dev 本地抽查首页 / 文章页 / 标签页 / 主题菜单实底与可读性

## 范围外

- 不新增写文章逻辑、不改搭建链路
- 不重命名 content slug 或 URL
- 12 个死神主题与 7 个纸主题的色板保留（作为可选外观），默认站点基底改为纸系