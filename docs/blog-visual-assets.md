# 边界笔记视觉素材

2026-10-05，用户认可工程手记封面图的质感，并授权生成更多背景与复杂图案。当前素材采用同一组墨蓝、钴蓝和纸页材质，由 imagegen 生成后转为本站 WebP。

| 素材 | 使用位置 | 设计职责 |
| --- | --- | --- |
| public/images/boundary-journal-hero.webp | 首页首屏 | 工程手记封面，首屏主视觉，透明背景 |
| public/images/boundary-journal-backdrop.webp | 默认主题的首页背景 | 纸页折叠，低强度背景，文字区留白 |
| public/images/boundary-engineering-atlas.webp | 备选资产，当前首页不加载 | 上一轮五册手记横幅 |
| public/images/boundary-journal-footer.webp | 默认主题的页尾 | 翻页纹理，低强度收尾背景 |
| public/images/boundary-system-silicon.webp | 大模型与智能体专题 | 分层芯片封装、硅片细节与精密键合线 |
| public/images/boundary-system-storage.webp | 分布式与存储专题 | 互联模块、层叠介质与金属连接器 |
| public/images/boundary-system-kernel.webp | 操作系统与内核专题 | 处理器封装、微针脚、晶振与内核总线 |
| public/images/boundary-system-network.webp | 网络协议与互联专题 | 光纤走线、波导通道与精细接口 |
| public/images/boundary-system-architecture.webp | 系统架构与实践专题 | 解耦模块、总线接口与领域物理边界 |

全套五张专题 WebP 均按 3:2 统一画幅提供，并随页面滚动懒加载。所有图片随站点提供，不引用外部图片服务。页面中的字体仍采用 Mac 原生字体优先的策略。

图像中的纸页、连线与墨迹属于艺术表达，不承载技术状态、真实架构或性能数字。封面不意味着实体出版物已经发行。文章正文不增加纹理背景；主题切换与阅读操作保持原有功能。

“播客背景”本轮按当前博客网页背景落实；若用户确认另有播客节目用途，再按实际画幅和节目名称生成独立资产，不添加尚未存在的播客功能或节目事实。

原始图片保留在 /Users/lianghaoyu/.codex/generated_images/01a10862-ba5f-7420-b904-3477182dc009，站点只引用仓库内的 WebP。

## 系统工程素材生成记录

使用内置 imagegen 工具生成三张独立图片，经 cwebp 转为 WebP（quality 82），保留原始 PNG。属于 stylized-concept 艺术素材，不是硬件设计图或架构说明。

| WebP | 原始 PNG |
| --- | --- |
| boundary-system-silicon.webp | exec-91a0ea01-7a1b-4ae6-80da-0541a391ba8f.png |
| boundary-system-storage.webp | exec-44187670-c182-4074-a224-bfdd1cdd0764.png |
| boundary-system-network.webp | exec-3097f071-9d8a-4e57-82f0-903ca886f2a7.png |

三张最终 prompt 都由以下公共部分加各自主题部分组成。

```text
Use case: stylized-concept. Asset type: editorial cover art for Boundary Notes, a refined Chinese systems engineering journal. Landscape 3:2 image, full bleed. High-end tactile technical photography mixed with precise contemporary industrial illustration, sophisticated midnight navy, electric cobalt blue, warm ivory, brushed silver, tiny restrained copper accents. Complex and credible engineering objects, exquisite physical material detail, strong single focal subject, generous margins for cropping. No words, letters, numbers, logos, UI screens, annotation, watermark, rainbow, neon cyberpunk, glowing random circles, decorative generic geometric solids. This is evocative art, not an explanatory architecture diagram.
```

芯片主题部分：

```text
A sculptural exploded computational module: a real silicon die with microscopic etched routing in a satin silver ceramic package, suspended above three thin cobalt and ivory substrate layers. Fine gold bonding wires around the die, carefully layered channels and traces. Oblique macro view, lithographic beauty and precise dimensional detail, dark ink navy studio background. The module centered, dramatic but soft museum lighting, physical grounded shadow, edges legible. Contemporary editorial sculpture about AI inference and computation.
```

存储主题部分：

```text
A precise small cluster of three modular data storage cartridges, navy anodized metal casings opened to reveal stacked ivory memory layers and thin cobalt bus planes. Elegant connectors couple the modules, small visible metal pins and branching trace paths, physical assembly, no symbolic nodes or floating balls. Low oblique perspective, asymmetrical balanced composition on warm ivory matte technical paper with barely visible printed engineering traces in far background, soft editorial studio lighting. Evoke persistence, replication and distributed storage.
```

网络主题部分：

```text
An elegant physical routing and waveguide study: one small brushed metal router-like core with a dense array of fine parallel fiber-optic cables that fan out, turn with precise radii, and converge through cobalt translucent waveguide channels. Ink navy, cobalt, silver, ivory. Macro still life on ivory engineering paper, three-dimensional ribbon paths and delicate connectors, disciplined beauty of real cable routing, subtle directional light, calm and tactile, sophisticated technical publishing artwork. No random stars, loops or fantasy holograms.
```
