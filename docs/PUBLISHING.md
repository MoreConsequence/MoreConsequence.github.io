# 写作与发布

## 当前发布配置

- GitHub 仓库：[`MoreConsequence/MoreConsequence.github.io`](https://github.com/MoreConsequence/MoreConsequence.github.io)
- 生产地址：[`moreconsequence.github.io`](https://moreconsequence.github.io)
- 生产分支：`main`
- 自动化：GitHub Actions 负责测试、静态构建与 GitHub Pages 发布

## 整个流程

```mermaid
flowchart LR
  A["创建 Markdown 草稿"] --> B["本地预览"]
  B --> C["draft 改为 false"]
  C --> D["Git 提交并推送"]
  D --> E["GitHub 自动检查与构建"]
  E --> F["GitHub Pages 发布"]
  F --> G["博客更新"]
```

系统没有传统后端。Markdown、主题和页面都在同一个 Git 仓库里；每次构建会生成文章 HTML、目录、阅读时长、搜索索引、RSS 和站点地图。

## 第一次设置

正式仓库已经配置完成，无需再连接第三方托管平台。GitHub Pages 的发布源是 GitHub Actions，工作流位于 `.github/workflows/deploy-pages.yml`。

在新电脑上只需克隆并安装依赖：

```bash
git clone https://github.com/MoreConsequence/MoreConsequence.github.io.git
cd MoreConsequence.github.io
npm install
```

## 日常发布

### 1. 创建草稿

```bash
npm run new -- "文章标题"
```

命令会生成 `content/posts/<标题>.md`，不会覆盖同名文章。

### 2. 写作与预览

```bash
npm run dev
```

浏览器打开 `http://localhost:3000`。草稿在本地可见；填写 frontmatter 后，页面会实时更新。

### 3. 发布

将文章中的：

```yaml
draft: true
```

改为：

```yaml
draft: false
```

然后推送：

```bash
git add content/posts
git commit -m "post: 文章标题"
git push
```

GitHub Actions 会验证所有文章字段、测试主题和内容逻辑，并执行生产构建。检查通过后，GitHub Pages 自动发布到 `https://moreconsequence.github.io`。

## 修改已发布文章

直接编辑原 Markdown，并增加或更新：

```yaml
updatedAt: "2026-07-27"
```

再次提交和推送即可。文章 URL 不变。

## 发布失败时

优先打开 GitHub 仓库的 Actions 页面。常见原因包括：

- 缺少标题、摘要或标签；
- 日期不是有效的 `YYYY-MM-DD`；
- 两篇文章使用了相同文件名；
- Markdown 代码块没有正确闭合；
- Node.js 版本低于要求。

本地运行以下命令可以复现绝大多数失败：

```bash
npm test
npm run lint
npm run build
```

构建完成后，静态站点位于 `out/`。如果三项本地检查都通过，再查看仓库 Actions 页面中的 `Deploy GitHub Pages` 运行记录。
