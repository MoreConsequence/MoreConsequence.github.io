# 《Agent 的方方面面》系列路线图

> 本文件是该系列的单一事实源：篇目、顺序、钩子、实验与数字纪律。系列主线是「以 Pi 为例，把 Agent harness 的工程维度拆开讲透」。
> 与 `docs/service-series-roadmap.md` 并列。本系列不写概念综述，每个判断都必须落到 Pi 源码、官方文档或可复现的本机实验上。

## 系列定位

- 读者：使用过 Claude Code / Codex / 自研 Agent 的工程师，想理解 harness 本身（loop、上下文、工具、会话、供应商、检索、扩展）而不只是"提示词技巧"。
- 主线：一个贯穿案例——[earendil-works/pi](https://github.com/earendil-works/pi)（Pi，MIT，94.3k stars，v0.84.x，2026-08-14 发布）。它极简（4 个内建工具、<1000 token 系统提示词）但有真实生产验证（Databricks 基准、Shopify 内部使用），是少数"个人能在几小时内读完"的开源 harness。
- 核心论点：Agent 的性能主要由 harness 决定而非模型——Databricks 同模型同档位下成本差 >2x、每轮上下文少约 3x；因此"Agent 的方方面面"不是奇技淫巧，是工程。
- 形式：每篇一个可复核工程问题，以 Pi 源码（标注 commit）、官方文档（标注日期/版本）、本机实验（落盘 evidence）为证据。可对照参考其他 harness（Claude Code、Codex）观点，但不得替代一手依据。

## 篇目与当前证据状态

| # | slug | 本篇承诺 | 代码/证据源 | 当前状态 |
| --- | --- | --- | --- | --- |
| 01 | agent-engine-layers | 五层架构总览与"刻意不做"的清单哲学 | `pi/README.md` 五包表、pi.dev "What we didn't build"、agent-loop.ts / system-prompt.ts 实测 | 草稿（2026-08-20 本机 clone @ 5cd93f6 实测 LOC） |
| 02 | agent-engine-loop | Agent 的骨架是 for 循环：turn/工具执行/收敛 | `packages/agent/src/agent-loop.ts`（796 行 while 双层循环）| 草稿（2026-08-20） |
| 03 | agent-engine-context | 上下文装配：system prompt、AGENTS.md、SYSTEM.md、compaction、skills 的渐进披露 | `coding-agent/src/core/system-prompt.ts`、docs/compaction.md、docs/skills.md | 草稿（2026-08-20） |
| 04 | agent-engine-session | 树状会话与状态：分支、/tree、JSONL 持久化、崩溃安全 | `packages/session-backends`、agent-core v4 Session API（0.84.0 改版） | 草稿（2026-08-20） |
| 05 | agent-engine-tools | 工具设计：为什么只有 4 个工具；bash 沙箱与执行边界 | `packages/agent/src/` tools/exec、docs/containerization.md | 草稿（2026-08-20） |
| 06 | agent-engine-provider | 统一 LLM 层：15+ 供应商、重试/退避/限流、多供应商路由 | `packages/ai/src/`（23.5k LOC，含 providers/retry/backoff/rate-limit/multi-vendor） | 草稿（2026-08-20） |
| 07 | agent-engine-extensions | 扩展面：skills、extensions、自修改（改自己的工具再 /reload）、Pi packages | `packages/coding-agent/examples/extensions/`（50+ 例）、docs/extensions.md | 草稿（2026-08-20） |
| 08 | agent-engine-security | 权限边界与供应链：无内建权限系统的取舍、三种容器化、npm 依赖加固 | `README.md`（permissions & containerization / supply-chain 两节）、Gondolin/Docker/OpenShell | 草稿（2026-08-20） |
| 09 | agent-engine-economics | token 经济性：为什么"少发 token"是 harness 的核心竞争力 | Databricks 官方基准（2026-07-08）、Shopify 官方 blog（2026-04-15）、pi-telemetry 记账 | 草稿（2026-08-20） |

状态词含义：`已核实` 表示当前对话中存在一手来源（官方 blog / 源码 / 官方文档）；`待写` 表示篇目已定但正文未动笔；`草稿` 表示内容已交付但未翻 draft。

## 系列承诺 → 工件 → 证据矩阵

| 承诺 | 当前工件 | 已有证据 | 尚缺证据 |
| --- | --- | --- | --- |
| Pi 五层架构可读 | 双基线：@ 5cd93f6（2026-08-20）与 @ b23741269（2026-08-23 复测）| 各包 LOC 双基线实测（08-23 复测：agent 15,280 / ai 30,870 / coding-agent 87,470 / tui 19,841 / telemetry 935；另新增 client/evals/protocol/server/session-backends/storage 六目录）；存档 `evidence/agent-engine-series/2026-08-23-local/measure.log` | 各层接口级源码走读（随 02-08 补）；monorepo 新目录未纳入五层叙事 |
| Agent loop 二重循环 | `packages/agent/src/agent-loop.ts` | `while(true)` 外层 + `while(hasMoreToolCalls)` 内层（行 170/174）| 用真实会话事件流复现 turn 序列（02 篇实验） |
| 系统提示词 <1000 tokens | `coding-agent/src/core/system-prompt.ts`（162 行）| 默认模板主体 1288 字符 ≈ 322 tokens（4 chars/token 估算） | 实测 token 计数（03 篇用 tokenizer 精确化） |
| 外部实证（Databricks）| 官方 blog 2026-07-08 | Pi 每轮上下文约 3x 少、同档位成本差 >2x、Opus 4.8 xhigh+Pi 通过率 90% 最高、GLM 5.2+Pi $1.25/task vs Opus 4.8 high+CC $2/task（均 ~87.5%）| 无（厂商自述基准，明确标注即可） |
| 外部实证（Shopify）| 官方 blog 2026-04-15 + 官方 X | unit tests 300x、React mount 20%、CI 65%；Liquid PR #2056（93 commits，53% 快）| 无（同为本机外部证据，标注"厂商/自述"） |

## 写作与验证规则

1. **外部数字先定点**：Databricks / Shopify 数字必须引官方 URL；引第三方转述（explainx、composio 等）只作参考意见，不署名数据来源。
2. **本机证据绑定 commit**：每篇标注调查所用 clone commit 与日期（首篇 5cd93f6，2026-08-20）；后篇如有 re-clone，数字以更新后的记录为准并在文中注明。2026-08-23 已全系列复测 @ b23741269，9 篇正文均改为双基线标注（system prompt 主体 tokens 精确化为 1197，「<1000」承诺已被上游打破并写入 03 篇）。
3. **LOC 类数字以实测为准**：README 自称"agent-core 3-4k / pi-ai 5-7k LOC"与实测（12.6k / 23.5k）不符——写正文时以实测数字 + 注明 README 口径差异，不采信广告数字。
4. **"刻意不做"与"做不到"分开**：Pi 声称的六项不做（MCP/sub-agents/权限弹窗/plan mode/to-dos/后台 bash）有替代路径；写取舍分析，不写"因为 todo 所以更好"。
5. **终篇不是发布许可**：09 篇 publish 前需逐项过 review.md 证据闸门；外部厂商基准在文中标注"外部基准，非独立复现"。

## 已确认的阅读钩子

- 01 → 02：五层地图到手，先深挖最核心的 agent loop。
- 01 → 03：system prompt <1000 tokens 的承诺在 03 精确化。
- 02 → 04：loop 的状态从哪里来/存到哪里去（session 树）。
- 05 → 08：工具执行边界延伸出权限与容器化。
- 06 → 09：供应商层与限流重试接上 token 经济性。
- 03/07：上下文装配与扩展面是"一切皆文件"哲学的两面，可对照读。

## 用户目标（2026-08-20）

> "以 pi agent 为例，介绍 Agent 的方方面面。"

不是功能清单，而是读者能追问：这个 loop 怎么收敛？上下文由谁拆装？工具凭什么可信？会话不会丢吗？供应商怎么换？每篇给出可复核答案与复现路径。