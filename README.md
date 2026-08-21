# 边界笔记 · Boundary Notes

一个以中文技术长文为核心的个人博客。页面采用“数字编辑部 × 开发者实验室”的视觉方向，内容全部来自 `content/posts/*.md`，不需要数据库、管理后台或在线编辑器。

在线访问：[moreconsequence.github.io](https://moreconsequence.github.io)

## 日常写作

```bash
npm run new -- "理解 Go Context 的边界"
npm run dev
```

新文章会出现在 `content/posts/`，默认是草稿。填写摘要和标签、完成正文后，把 `draft` 改为 `false`：

```bash
git add content/posts
git commit -m "post: 理解 Go Context 的边界"
git push
```

推送到 `main` 后，GitHub Actions 会自动运行测试、代码检查、静态构建并发布到 GitHub Pages。

完整的首次设置和发布说明见 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## 本地命令

| 命令 | 用途 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run dev` | 在 `http://localhost:3000` 预览 |
| `npm run new -- "标题"` | 创建一篇草稿 |
| `npm test` | 运行内容与界面逻辑测试 |
| `npm run lint` | 检查代码规范 |
| `npm run build` | 验证生产构建 |
| `npm run start` | 预览 `out/` 静态产物 |

需要 Node.js 22.13 或更新版本。

## 文章格式

```yaml
---
title: "文章标题"
description: "一句话摘要"
publishedAt: "2026-07-26"
updatedAt: "2026-07-27" # 可选
tags: ["Go", "架构"]
draft: false
featured: true
series: "系统设计手记" # 可选
---
```

构建会验证字段和真实日期。生产环境自动排除草稿；Markdown 支持 GFM、脚注、表格、任务列表、标题锚点和代码高亮。

## 主题

主题清单在 `lib/themes.ts`，颜色变量在 `app/globals.css`。页面组件只使用语义颜色。增加主题时：

1. 在 `lib/themes.ts` 登记主题 ID、名称和预览色；
2. 在 `app/globals.css` 增加对应的 `[data-theme="<id>"]` 变量；
3. 无需修改页面和文章。

首发提供“纸上”“午夜”和“跟随系统”。

## 项目结构

```text
app/                 页面、路由、RSS 与站点发现文件
components/          页面组件、主题、搜索和阅读工具
content/posts/       唯一的文章内容源
lib/content/         Markdown 校验、编译、标签和相关文章
scripts/new-post.mjs 新建文章命令
tests/               内容与界面逻辑测试
.github/workflows/   GitHub Pages 自动发布
```
