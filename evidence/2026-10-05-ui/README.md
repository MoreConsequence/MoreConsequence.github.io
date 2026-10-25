# 2026-10-05 博客 UI 迭代：本地验证

范围：首页、共享导航与字体、归档领域入口、文章阅读布局。设计约定见 ../../DESIGN.md。未修改文章、图表源、依赖或发布状态。

## 字体与布局证据

macOS 的 Codex 内置浏览器使用 CDP CSS.getPlatformFontsForNode 检查首页标题，返回：

- familyName: PingFang SC
- postScriptName: PingFangSC-Semibold
- isCustomFont: false
- glyphCount: 15

这证明此环境中的中文标题保留 Apple 原生字体；不证明 Windows 实机的光栅化、DPI 或 ClearType 显示效果。Noto Sans SC 的 101 个本地 WOFF2 分片通过文件头和路径检查，许可完整；CSS 无远程字体 URL。分片总计 4.29 MiB，浏览器按 unicode-range 加载，不是每页全部下载。Mac 在文章页面仅观察到一个用于后备字符的分片请求，不覆盖原生标题。

文章样本：/writing/k8s-storage-01-csi-architecture-volume-lifecycle/。

| 测试视口 | document clientWidth | document scrollWidth | 正文宽度 | 列布局 |
| --- | --- | --- | --- | --- |
| 320 | 312 | 312 | 280 | 单栏 |
| 768 | 760 | 760 | 698.55 | 单栏 |
| 1024 | 1016 | 1016 | 760 | 单栏 |
| 1440 | 1432 | 1432 | 760 | 240 + 760，间隔 40 |
| 1920 | 1912 | 1912 | 760 | 240 + 760，间隔 40 |

390px 首页与领域归档：document clientWidth 与 scrollWidth 均为 382px；未发现整页横向溢出。此处的 8px 差异来自浏览器滚动条。

## 已检查交互

- 带 pillar=distributed-systems 的归档入口选中“分布式与存储”，显示 59 篇的领域计数。
- 归档内搜索 Raft 后显示匹配文章。
- 紧凑列表视图的 aria-pressed 切换为 true，可切回卡片视图。
- 手机文章目录默认隐藏，点击“本文目录与专栏”后 aria-expanded 和 data-open 同时为 true。
- 全站搜索入口可打开对话框；开发模式的索引首次编译较慢，最终结果在静态预览复核。

## 工程验证

- npm test：12 个文件、47 项测试通过。
- 默认主题预览色调整后，npm test -- tests/themes.test.ts：8 项通过；更新对应的既有色板断言。
- npm run lint：0 errors、1 个既有 next/no-img-element warning，位于未修改的 mermaid-renderer.tsx。
- 修改过的 TS/TSX 文件再次执行 ESLint：通过。
- git diff --check：通过。
- 完整静态构建与最终截图结果在下方补充。

## 最终静态预览结果

- npm run build：退出码 0，TypeScript 与编译通过，1754/1754 页面成功生成。静态生成耗时约 5.4 分钟；8 个路由第一次生成超过 60 秒，Next.js 自动重试后完成，未调整超时配置。
- 静态输出由现有缓存中的 serve 提供：http://127.0.0.1:50462/。首页 HTTP 200。
- 最终静态首页在 320、390、768、1024、1440、1920px 下，scrollWidth 均等于 clientWidth。
- 归档、系列、标签、关于页在 320、768、1440px 下，scrollWidth 均等于 clientWidth。
- 静态文章样本在 1440px 下正文宽度 760px，阅读进度条只有 1 个；该页检查到的浏览器 error 日志为空。
- 静态版全站搜索 Raft 返回真实文章结果。
- 墨笺主题切换后的 background 为 rgb(20, 20, 19)，text 为 rgb(240, 238, 232)，检查后恢复“自动”默认主题。
- 临时视口覆盖已清除，首页预览标签页保留供用户查看。
- 截图：home-desktop.png（1440×960）、home-mobile.png（390×844）、article-desktop.png（1440×960）。
- 没有提交、push 或部署。本机浏览器与布局检查不能替代 Windows 实机验收。

## 工程手记视觉体系迭代（当前版本）

用户要求重做左上角标识，并保留更精致、有意义的主视觉；随后认可工程手记生成图的质感，授权生成更多背景与复杂图案。

- 移除方块“界”字标，采用“边界笔记 / Boundary Notes”文字标识。
- 移除圆形、方形拼接构图及其样式；首页使用透明工程手记封面。
- 生成并集成纸页折叠背景、五册手记横幅和页尾翻页背景。四张 WebP 合计约 314 KiB，图片随站点提供。
- 背景用于展示区，文章正文不增加纹理。配套浅色背景仅在默认“边界 · 雾蓝”主题应用；其他主题保留其配色、封面与技术版图横幅。
- 完整页面检查发现旧主题入口继承白色文字；现已显式设为 foreground。默认主题检查值：标题与链接 rgb(24, 44, 70)，区域背景 rgb(233, 238, 246)。
- 当前标题使用 PingFangSC-Medium，familyName=PingFang SC、isCustomFont=false、glyphCount=15，确认保留 Mac 原生字体。
- 320、390、768、1024、1440、1920px 页面布局检查未发现整页横向溢出；静态版 390px clientWidth=scrollWidth=382。
- 首页相关 3 项测试通过，修改的 TSX 文件 ESLint 通过，设计检测结果为空，git diff --check 通过。
- 最终 npm run build 退出码 0；编译、TypeScript 与完整静态生成成功。out/ 包含新增视觉资产。开发预览已关闭，继续使用 http://127.0.0.1:50462/ 静态预览。
- 检查默认主题后恢复用户原有 hyorinmaru 主题偏好；临时视口已清除。
- 当前截图：home-journal-final-desktop.png、home-journal-final-mobile.png、home-journal-final-full.png。前面的几何构图截图与测试中间截图只记录早期版本，不代表当前设计。
- 素材说明见 ../../docs/blog-visual-assets.md。未提交、push 或部署。
## 系统工程视觉深化（最新版本）

用户认可上一轮后，要求继续增强特色与技术气质。本轮保留手记封面、文字标识和字体策略，新增三张本地系统工程专题图；五册手记横幅作为历史备选保留，首页不再加载。

- 三张新增 WebP 合计 310,540 bytes（约 303 KiB），按滚动懒加载；原始图片与完整生成 prompt 见 docs/blog-visual-assets.md。
- 技术版图采用主专题跨两行、辅助专题与文字入口相结合的布局；窄屏单列，图片与标题分区。序号只作领域导航，不表达严格技术分层。
- 清除首页最新文章继承的旧卡片空白行，改为分隔列表；修正精选在窄屏的 padding specificity，隐藏重复装饰箭头与多余间距。
- npm test -- tests/layout.test.tsx：3 项通过。app/page.tsx ESLint 通过。git diff --check 通过。
- npm run build：退出码 0，编译 5.1s、TypeScript 3.1s、1754/1754 静态页面生成 105s。日志 /tmp/github-blog-20261005-system-visual-build.log，无重试或错误记录。
- 最终静态首页在 320、390、768、1024、1440、1920px 下，clientWidth=scrollWidth；五个专题入口自身也未横向溢出。三张图片加载成功，首页浏览器 error 日志为空。
- 点击存储专题后，归档选中“分布式与存储 59”。墨笺主题实际审看通过：专题标题 rgb(240,238,232)，文字 rgb(168,166,159)，背景随主题变化。
- 当前截图：home-system-final-desktop.png、home-system-final-mobile.png、home-system-final-full.png。home-system-dark.png 为本轮开发预览的深色专题截图。早期 journal 截图保留作迭代历史。
- 当前静态预览 http://127.0.0.1:50462/；恢复该来源原有 hyorinmaru 偏好，清除临时视口覆盖。未提交、push 或部署，Windows 实机显示仍未验收。
