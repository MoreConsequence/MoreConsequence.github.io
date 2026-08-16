---
title: "一帧只有 16ms：Layout、Paint、Composite 谁在吃预算"
description: "60Hz 的硬约束给每一帧 16.7ms 预算。拆开渲染管线的四段：Style 计算、Layout 重排、Paint 绘制记录、Composite 合成，讲清为什么 transform/opacity 便宜、width/height 贵，以及用 DevTools 怎么找到谁在超支。"
publishedAt: "2026-08-08"
updatedAt: "2026-08-08"
tags: ["浏览器", "渲染", "性能"]
draft: false
featured: false
series: "浏览器原理"
---

**TL;DR：** 60Hz 刷新率把每一帧的预算定死在 16.7ms，超支就是丢帧。渲染管线的四段成本完全不同：Style 按选择器匹配计数、Layout 按整棵布局树重排、Paint 按绘制指令记录、Composite 只合成已光栅化的图层。所以 transform/opacity 只走最后一段（便宜），width/height 走全部四段（贵）。优化的第一判断不是"属性贵不贵"，而是"我触发了哪一段"。

## 一、16.7ms 从哪来：刷新率是物理约束，不是性能目标

显示器以固定频率刷新：60Hz 意味着每秒重绘 60 次，即每 16.7ms 一帧。浏览器的主线程在一个"渲染帧"里做完"执行 JS → 计算样式 → 布局 → 绘制 → 提交合成"，然后交给 GPU 显示。**这一整条链必须在 16.7ms 内完成**，否则显示就会错过这一帧，观众看到的是停顿。

两件事让这个预算比听起来更紧：

1. 浏览器还有自己的调度成本：帧开始要有 vsync 对齐、提交要留出光栅化时间。**开发者可用的主线程时间明显少于 16.7ms**——业界普遍以 10ms 作为主线程帧预算的经验线，剩下留给合成线程和显示管线。
2. 60Hz 的帧率目标是下限不是上限。120Hz 屏幕把预算砍半到 8.3ms；但对性能优化的判断，始终以"有没有超 16.7ms"为准绳。

## 二、管线四段：每段的账本不一样

渲染管线可以压缩成四段，各自的工作与成本模型：

```mermaid
flowchart LR
    A["Style 计算<br/>选择器匹配 + 属性合并"] --> B["Layout 布局<br/>计算盒模型几何"]
    B --> C["Paint 绘制记录<br/>生成绘制指令"]
    C --> D["Composite 合成<br/>把已光栅化图层合成"]
    D --> E["GPU 显示"]
```

| 段 | 干什么 | 成本由什么决定 | 触发器示例 |
| --- | --- | --- | --- |
| Style | 匹配 CSS 选择器，得出每个元素的最终样式 | 选择器数量 × 元素数量 | 任何样式变更 |
| Layout | 计算每个盒子的位置与尺寸 | **整棵受影响子树的盒子数** | width/height/padding/top |
| Paint | 生成绘制指令（记录） | 绘制区域大小与复杂度 | color/background/box-shadow |
| Composite | 把图层合成为最终画面 | 图层数 × 每个图层的偏移 | transform/opacity 的动画 |

**关键不对称：越靠前的段，影响面越大。** Layout 修改一个元素的宽度，可能波及其父容器、兄弟、后代全部重排——这是一棵子树的代价。而 Composite 只是"把这块位图挪 1px"，无论挪多远，成本都只与图层数相关，与元素数量无关。

## 三、Style：选择器的税

浏览器把 CSS 规则匹配到每个元素。成本模型是：

**总成本 ≈ 选择器数量 × 元素数量 × 每条规则的平均匹配代价**

所以"后代选择器贵、class 选择器便宜"是有依据的：`div p a` 需要从右往左逐层回溯，`box` 只需查 hash。但工程上的重点不在微观优化——现代页面的 Style 计算通常在毫秒级。真正的麻烦是**把样式计算当成"改了一个类就全量重算"**：浏览器没有增量选择器，任何 CSS 变更都至少对"受影响元素"全量重新匹配。

实测视角（DevTools Performance 面板的 Style 行）：一次 `el.style.width = '100px'` 在小规模页面上几乎看不到，在大型表格页面上可能拉出数毫秒的 Style 块。这与 React/Vue 框架无关，是 CSS 引擎的匹配模型决定的。

## 四、Layout：最贵的一段，全局性税

Layout（也叫 reflow）计算每个盒子的几何信息：宽高、内边距、位置。它有两个让成本失控的特点：

**特点一：一次局部变更，可能重排整棵子树。** 一个元素的宽度变化，其兄弟、父容器、乃至父容器之后的所有兄弟（取决于几何依赖）都会跟着重排。生产里最典型的场景：往列表顶部插一条记录，可能触发整列 reflow。

**特点二：读布局会阻塞。** 浏览器有"脏位"机制：布局只要在"你读的时候"还未提交，就会**立刻强制同步执行**。这个模式叫 layout thrashing：循环里"写样式 → 读 offsetHeight"交替出现，每一轮都触发一次整树重排，把 O(N) 变成 O(N²)。

```js
// 反例：循环里读写交替，每轮强制 reflow
for (const el of list) {
  el.style.width = width + 'px'  // 写
  console.log(el.offsetWidth)    // 读 → 立刻同步 layout！
}
```

```js
// 正解：先批量写，再统一读
for (const el of list) el.style.width = width + 'px'
for (const el of list) console.log(el.offsetWidth)
```

**Layout 的成本判断**：看 DevTools 里 Layout 行的时间，如果它 >5ms，多半是整树重排或 thrashing，而不是单条样式的问题。

## 五、Paint：绘制记录是"记账"，不是"画"

Paint 段生成绘制指令（paint record）：这一块填什么颜色、这里画一条什么弧线、阴影的范围。它不直接画像素——真正的像素着色发生在后面的光栅化（rasterize），通常由合成线程并行的"瓦片"（tile）完成，不在主线程时间线上。

所以 Paint 的成本由**绘制区域的复杂度**决定：

| 属性 | 是否触发 Paint | 成本感受 |
| --- | --- | --- |
| `color` / `background-color` | 是 | 区域大时明显 |
| `box-shadow` | 是（通常需要额外图层） | 模糊半径大时明显 |
| `border-radius` | 是 | 会触发图层边界 |
| `transform` | **否** | 动画时零 Paint |
| `opacity` | **否**（0→1 有渐变例外） | 动画时零 Paint |

**核心结论：把动画限制在 transform/opacity，就跳过了 Style→Layout→Paint 三段，只走 Composite。** 这是"为什么 CSS 动画比 JS 动画省"的第一层原因——JS 动画改的是 left/top，每帧触发 Layout；CSS transform 动画每帧只更新合成参数。

## 六、Composite：便宜但有限，图层不是免费的

Composite 把各图层按 z-order 合成为最终画面。它便宜，但图层本身有税：

- **图层内存**：每个独立图层都有对应的位图纹理（一张 1080p 全屏图层就是 8MB+）。
- **图层数量**：合成器要遍历所有图层，太多小图层反而拖慢合成。

所以"每个元素都加 `will-change: transform` 强行开层"是经典误用：图层数量爆炸，内存与合成都超支。`will-change` 的正确用法是给**即将动画的元素**提前开层，用完即删。

真正省钱的组合拳：

1. **动画只用 transform/opacity**（尤其 `translate` 代替 `left/top`）；
2. **需要开层的元素少而精**（页面主体、卡片的移动动画），避免全屏覆盖层；
3. **固定大小内容**用 `contain: layout paint` 告诉浏览器"这棵子树不影响外面"。

## 七、DevTools 实操：找到谁在吃预算

Performance 面板录制一段交互（如滚动、点击动画），看主线程时间线：

```text
Frame main thread（示意数据，非真实录制）:
  [Style 0.8ms] [Layout 2.4ms] [Paint 1.2ms] ... [Composite 0.4ms]
  总 4.8ms → 低于 16.7ms，帧完整
```

三个排查顺序：

1. **看 Layout 行**：>3ms 先怀疑整树 reflow 或 thrashing；用 Performance 面板的"Layout 工具"（DevTools 的 Layout 面板会标出重排来源）。
2. **看 Paint 行**：>2ms 检查 box-shadow/背景大图，尝试 `transform: scale()` 替代视觉缩放。
3. **看总时长**：>16.7ms 则改动画属性，或用 `requestAnimationFrame` 把工作移到帧头，避免"一帧里做两轮主线程工作"。

对长时间运行的页面，还可以用 Performance 面板的"Frame"通道确认是否有 dropped frame（掉帧）——这正是 16.7ms 预算被击穿的直接证据。

## 八、结论：16.7ms 预算要看哪一段在消耗

渲染性能的答案从来不是"CSS 里别用动画"，而是把工作从管线前端挪到后端：

| 触发位置 | 代价 | 何时允许 |
| --- | --- | --- |
| Style + Layout | 全树级 | 页面结构变更，不可避，但应批量 |
| Paint | 绘制复杂度 | 需要真正重绘视觉效果 |
| Composite-only | 图层级 | **动画/交互，必须选这个** |

越往后越值得动：动画/交互阶段必须停在 Composite-only；结构变更尽量批量；真正的 60fps 还受制于主线程超支引发的帧延迟——那是事件循环与 vsync 的另一笔账，见[事件循环不是一个循环](/writing/understanding-event-loops)。

## 参考资料

1. Chromium 文档：Rendering Pipeline（Style/Layout/Paint/Composite）—— https://developer.chrome.com/docs/devtools/performance/reference
2. web.dev：Animations and performance（为什么 transform/opacity 走合成）—— https://web.dev/animations-guide/
3. web.dev：Avoid layout thrashing —— https://web.dev/avoid-large-complex-layouts-and-layout-thrash/
4. CSSWG：will-change 属性与层提升语义 —— https://drafts.csswg.org/css-will-change/
5. Chrome 开发者工具：Performance 面板帧通道 —— https://developer.chrome.com/docs/devtools/performance

> 延伸阅读：一帧里"何时渲染"由事件循环的渲染机会决定，见[事件循环不是一个循环](/writing/understanding-event-loops)；渲染之外的网络等待如何消耗首帧预算，见[HTTP 缓存不是"快慢"问题：Cache-Control 与 304 的账本](/writing/http-cache-control-etag)。
