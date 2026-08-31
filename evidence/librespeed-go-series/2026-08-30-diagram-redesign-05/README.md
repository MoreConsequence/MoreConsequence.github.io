# LibreSpeed Go interface diagrams — task 05

本目录只记录《接口手册：LibreSpeed Go 全部 12 条路由的请求与响应规格》本次图表重绘的工作源、事实核对和导出说明。

## 范围

- 目标 Markdown：`content/posts/speedtest-engineering/librespeed-go-05-interface.md`
- 允许的图片：`librespeed-go-interface-routes-specification.svg`、`librespeed-go-admin-session-security.svg`、`librespeed-go-rest-curl-sequence.svg`
- 源码：`/Users/lianghaoyu/codes/speedtest-go` @ `59cff12d1b95b3f80acd8a42b0156aa4fde440de`
- 既有运行取证：`evidence/librespeed-go-series/2026-08-26-local/`
- 绘图规范：`/Users/lianghaoyu/.codex/skills/diagram-design/`
- 生成日期：2026-08-30

## 四个设计参数

- 输出：博客正文内嵌 SVG
- 尺寸：`doc-inline`，`960 × 600`
- 细节：`balanced`
- 读者：`engineer`
- 变体：静态 light，无动画

## 资产决策

| 资产 | 处理 | 类型 / 主关系 |
| --- | --- | --- |
| `librespeed-go-interface-routes-specification.svg` | 删除；正文改用 Markdown 表格 | 12 个现代/`/backend/` API 挂载是并列规格，不需要把列表伪装成关系图 |
| `librespeed-go-admin-session-security.svg` | 重绘 | State Machine：数据库开关、密码哨兵、登录失败/成功、Cookie 会话、登出和进程重启之间的状态转换 |
| `librespeed-go-rest-curl-sequence.svg` | 重绘 | Sequence：curl 与 speedtest-go 之间从身份探测到测速、遥测、结果读取和管理面访问的时间顺序 |

路由表的“12”在正文中明确限定为 `web.go:67-82` 的现代路径与 `/backend/` 路径共 12 个核心 API 挂载；`web.go:85-96` 另注册 12 个 `.php` 兼容挂载。`/*` 静态文件路由和 `/results` 的四个 PNG 路径变体不被错误地折叠进这 12 个 API 挂载。

## 生成链

```text
*.html（唯一图表工作源）
  → export.mjs（提取第一个 <svg>，注入 XML 声明与 XML-escaped Google Fonts @import）
  → public/images/librespeed-go-admin-session-security.svg
  → public/images/librespeed-go-rest-curl-sequence.svg
```

路由 SVG 没有新的 HTML 工作源，因为它被正文表格替代并从允许图片中删除。`public/images/` 下的两个 SVG 都由对应 HTML 导出，不能反向编辑。

## 事实边界

- 图中只保留 `speedtest-go` 源码能定位的路径、handler、Cookie 属性、状态码和调用阶段；旧 SVG 中的 Basic Auth、bcrypt、防暴力破解、速率限制、明文嗅探、零分配和性能口号均不继承。
- 现有运行证据是 Darwin/arm64 loopback；它支持本机请求样例，不支持公网、TLS/HTTP2、反向代理、生产并发或部署结论。
- `DrawPNG`、`JSONResult` 和 `Record` 在 `database_type=none` 时的分支保留在正文规格中，但 curl 图使用已有 `memory` 数据库会话的成功路径。

## 验证记录

完成后在此更新，只记录本批次局部检查；不把它们表述为全站测试、构建、部署或 GitHub Pages 验证。

- [ ] 两个 HTML 通过 diagram-design `self_check.py`
- [ ] 两个导出 SVG 通过 `xmllint --noout`
- [ ] 两个导出 SVG 通过 `rsvg-convert` 渲染检查
- [ ] 目标 Markdown 的图片引用和删除范围已做静态检查
- [ ] 未运行共享 `npm test`、`npm run lint`、`npm run build`、`npm start`

详细删减与事实映射见同目录的 [fidelity-ledger.md](fidelity-ledger.md) 和 [source-verification.md](source-verification.md)。
