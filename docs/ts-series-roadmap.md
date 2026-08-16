# 《从 Go 到 TypeScript》系列路线图

> 本文件是该系列的单一事实源（source of truth）：篇目、顺序、钩子（每篇答上一篇没答完的题）、实验与数字纪律。写新篇前先读此文件，写完更新状态。

## 系列定位

- 读者：Go / Java 后端工程师，迁移动机大概率是前端/全栈、Node 后端、Agent 开发。
- 形式：每篇一个反直觉核心论点 + 本机实测数字 + 可运行代码（零依赖优先，落 `experiments/`）。
- 串联机制：每篇结尾丢钩子，下一篇开头接住（AGENTS.md 经验沉淀第 5 条：每代答上一代没答完的题）。
- Agent 场景贯穿，但不硬塞；纯原理篇必须可验证。
- 数字纪律：所有性能/体积/耗时数字一律本机实测后粘贴；拿不准写量级加"约"。

## 篇目（顺序即阅读顺序）

| # | slug | 主题 | 核心论点 | 接上一篇的钩子 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 01 | typescript-pitfalls-for-go-backend-developers | 语法避坑 | 类型不校验、as 不转换、const 不冻结、async 不并发 | — | ✅ 已发布 2026-08-14 |
| 02 | typescript-llm-tool-loop | LLM 工具循环 | 失败不是异常，是数据；类型系统让每种失败占位 | 01 结尾：运行时验证/并发编排/数据脱敏 | ✅ 已发布 2026-08-15 |
| 03 | typescript-interface-schema-zod | 接口层 schema 三合一 | 一个 schema 产出运行时校验+静态类型+契约，信任边界单一化 | 02 结尾：用 zod 的 discriminatedUnion 重写 parseToolCall | ✅ 已发布 2026-08-16 |
| 04 | typescript-toolchain-rules | 工具链运行规则与动态更新 | 语法之外的另一半：semver 范围、lockfile、包管理器布局、tsc vs 转译器；Go 的 go.mod 精确锁定 vs Node 的"声明范围+实际锁定"双轨制 | 03 的 zod 依赖来自 npm，依赖如何被锁定/更新 | ✅ 已发布 2026-08-16 |
| 05 | typescript-dto-boundary | DTO 边界与数据脱敏 | 输入侧 zod 管"进"，DTO 管"出"；序列化才是真相，Omit<> 只在编译期裁剪 | 01 结尾：数据脱敏是后端自己的责任 | ✅ 已发布 2026-08-16 |
| 06 | typescript-event-loop-vs-gmp | 事件循环 vs Go GMP | goroutine 抢占式调度 vs Promise 协作式队列；"并发"直觉在 Node 里反噬 | 02 的 async 编排依赖事件循环理解 | ✅ 已发布 2026-08-16 |
| 07 | typescript-streams-backpressure | 流式与背压 | 流式本质是 pull 不是 push；for await 把背压藏起来 | 06：事件循环是背压机制的地基 | ✅ 已发布 2026-08-16 |
| 08 | typescript-agent-state-machine | Agent 状态机 | 状态机价值在转移；可辨识联合让非法转移编译期消失 | 02 的 ToolResult + 03 的 discriminatedUnion | ✅ 已发布 2026-08-16 |
| 09 | typescript-errors-result-throw | 错误处理：throw vs Result | JS 无共识，Agent 编排必须选边；错误迟早是模型要读的数据 | 01 的 try/catch 局限 + 02 的 ToolResult 泛化 | ✅ 已发布 2026-08-16 |
| 10 | typescript-type-gymnastics | 类型体操实用边界 | TS 泛型是证据推导不是实现约束；80% 体操服务于 20% 场景 | 01 的类型语义 + 03 的类型推导 | ✅ 已发布 2026-08-16 |
| 11 | typescript-agent-production | Agent 生产化 | 超时不是取消，写操作安全网是幂等键；Agent 预算是会话级账本 | 02 结尾：AbortSignal 真取消 + 幂等键 | ✅ 已发布 2026-08-16 |

后续扩展位：12+ 从 11 号后面挂（如测试策略 vitest、发布 CI、装饰器/实验语法、ESM/CJS 双包危机深潜），系列只长不堵。

## 关键设计决策（写每一篇时必须遵守）

1. **钩子闭环**：新篇开头必须显式引用上一篇结尾丢的钩子（正文互链 /writing/slug，slug 必须先存在）。
2. **实验先行**：先跑实验拿真实数字，再动笔；实验代码落 `experiments/<slug>/`。
3. **每篇必答的"语法外"关切**：用户明确要求工具链运行规则（semver 动态更新、lockfile、包管理器布局、tsc/转译器分工、@types 机制）进入系列——04 专篇承担，其余篇凡涉及依赖/构建/运行环境处顺手点一句并链到 04。
4. **标题方案**：每篇给推荐 + 备选 + 锐利理由，一次带全（AGENTS.md 经验沉淀第 7 条）。
5. **数字呼应**：多篇同批数字互相一致（如 02 的超时竞态数据在 08/11 复用时不改写法）。

## 已确认的钩子明细（正文互链以实际文件为准）

- 01 结尾钩子：「运行时验证、并发编排、数据脱敏仍然是后端自己的责任」→ 03（验证）、02（编排）、05（脱敏）。
- 02 结尾钩子：「AbortSignal 真取消 + 写工具幂等键；zod 的 discriminatedUnion 把运行时校验与类型定义合二为一」→ 11（取消/幂等）、03（zod）。
- 03 结尾钩子：zod 依赖来自 npm，`package.json` 里 `^1.x.y` 是什么规则、lockfile 锁住什么 → 04。
