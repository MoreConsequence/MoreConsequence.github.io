# 像素伴读小团子 · 2026-10-14

按用户逐轮反馈保留紫蓝头发、白色圆胖团子、豆豆眉、半睁眼和腮红。最终轮廓加宽并缩短，两侧头发向外鼓起；常态使用小幅动作。动作由代码实时计算，角色不再加载固定 sprite sheet。

## 当前实现验证

- `npm test -- tests/pixel-pet.test.tsx tests/article.test.tsx`：2 个测试文件、18 个用例通过，包括豆豆眉、完整动作时间轴的整数像素/裁切检查、连续姿态、打断和庆祝时机。
- `npx eslint components/ui/pixel-mascot.tsx lib/pixel-pet.ts tests/pixel-pet.test.tsx`：通过。
- 使用继承仓库配置的临时 tsconfig 对宠物组件、模型、测试和 Next 类型做 `tsc --noEmit`：通过。临时配置位于 `/tmp/github-blog-pixel-pet-20261014/tsconfig.json`。
- Impeccable detector 对改动组件与 CSS：返回 `[]`。
- `git diff --check`：通过。与开始时保存的 179 个已有 modified/untracked 文件逐个比较，只有任务目标 `components/ui/pixel-mascot.tsx` 改变；构建自动写入的 `next-env.d.ts` 已恢复到构建前的原始内容。

## 本地浏览器

使用同一 Codex 内置浏览器的有效文章预览，最终在 1280px 桌面与 390px 手机视口检查。手机目录展开后，176px 宽的宠物完整显示，页面没有横向溢出。验证结果见 `browser-checks.json`。

- Canvas：72 × 48 逻辑像素，显示为 144 × 96。
- 真实 Canvas 输出的 alpha 只有 0 和 255，静态角色使用 6 种实色。
- 键盘 Enter 可触发互动与暂停/继续；暂停后的画面采样保持不变。
- 减少动态效果设置生效时，`paused=false`、`reduced=true`，点击后的动作保持静态反馈，画面采样不变。
- 已恢复正常媒体偏好和默认视口。

`desktop.png` 是最终造型的暂停截图；`mobile.png` 是手机目录展开后的截图；`pet-detail.png` 是从绘制函数直接生成的 6 倍像素预览，用于看清造型细节。`desktop-first.png` 属于发现并修复初次隐藏页 Canvas 未绘制的问题之前的检查记录，不作为最终外观证据。

## 全站构建边界

本轮运行 `npm run build`，应用编译成功，随后 TypeScript 检查被已有文件 `components/post/article-companion.tsx:6` 阻塞：它从 `@/lib/content/posts` 导入未导出的 `PostMeta`。该文件与开始时的内容一致，本任务没有修改它。宠物目标的独立 TypeScript 检查通过；不能把这份结果描述为全站构建通过或已部署。

没有提交、推送或部署。已有用户修改保留。
