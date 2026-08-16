# 《把原理变成服务》系列路线图

> 本文件是该系列的单一事实源：篇目、顺序、钩子、实验与数字纪律。当前快照只证明本地教学原型与部分 CI 配置，不证明生产闭环。
> 与 `docs/ts-series-roadmap.md` 并列；本系列的职业落点是把原理变成可交付的本地工件，再诚实列出距离生产还缺什么。

## 系列定位

- 读者：原理扎实但没有完整交付过服务的开发者；目标是“转成职业开发”。
- 主线：一个连续演进的 TS 后端教学原型（Agent 订单助手：自然语言查订单/下单/取消，Agent 调工具）从需求到本地验证；生产数据库、部署、观测和恢复作为未完成边界单独记录。
- 形式：决策现场、本机实验、可运行代码和构造事故演练。每篇回答一个可复核问题，不把共享 demo 的当前状态写成生产状态。
- 与 TS 系列的关系：承接 AbortSignal、幂等键和会话预算，把抽象命题变成订单服务的局部合同。

## 篇目与当前证据状态

| # | slug | 本篇承诺 | 代码/测试 | 当前边界 |
| --- | --- | --- | --- | --- |
| 01 | service-design-adr | 用 ADR 记录选型取舍 | `experiments/service/docs/adr/0001-framework.md` | 性能/在线证据待复核 |
| 02 | service-api-shape | 错误、重放与冲突合同 | `app.ts` + 并发/冲突测试 | 单进程原子 claim |
| 03 | service-testing-strategy | 测试覆盖反例而非只追覆盖率 | 3 文件、18 tests | 内存替身，不含 PostgreSQL |
| 04 | service-ci-cd | 让根目录 CI 只证明它真的执行过的 job | `.github/workflows/service-ci.yml` | Actions run、deploy、回滚待补 |
| 05 | service-observability-slo | good event、分母、窗口与分桶 | `Metrics` + 四条退出路径测试 | handler 微基准，不是生产 p99 |
| 06 | service-incident-drama | 用构造反例检查双表增长 | `store-growth.ts` + bounded/unbounded store | 历史 RSS/raw 证据待找回 |
| 07 | service-release-checklist | 每一勾都绑定证据等级 | `docs/release-checklist.md` | 生产门禁未完成 |

状态词的含义：`本地证据` 表示当前 checkout 有可重跑命令和输出；`待补` 表示配置或设计存在，但没有真实平台/数据库/部署记录；`未完成` 不会因为系列有了终篇而自动变成完成。

## 系列承诺 → 工件 → 证据矩阵

| 承诺 | 当前工件 | 已有证据 | 尚缺证据 |
| --- | --- | --- | --- |
| API 错误和幂等合同 | `experiments/service/src/app.ts`、`store.ts` | Node 24 本地 18 tests | PostgreSQL 唯一约束、重启、两实例 |
| 指标覆盖失败路径 | `metrics.ts`、`app.test.ts` | 404/400/500 分桶测试 | 真实端口、依赖延迟、长期 SLI |
| CI 验证 service | 根 `.github/workflows/service-ci.yml` | 本机 typecheck/build | Actions matrix run、artifact、部署 URL |
| 事故排查 | `scripts/store-growth.ts`、bounded/unbounded store | 500 写入的 size 不变量 | 历史 raw RSS、heap profile、回滚演练 |
| 发布检查 | `docs/release-checklist.md` | 本地项分层 | staging smoke、告警、迁移和回滚 |

## 写作与验证规则

1. **代码连续但证据分离**：共享 `experiments/service/` 可以继续演进；文章数字必须绑定 evidence snapshot，不覆盖旧输出。
2. **比较同语义**：不能用 Go `time.Sleep` 对比 Node busy loop，也不能把 `app.request()` 叫生产 API p99。
3. **历史事实先找原始材料**：缺 commit、环境、原始输出和分母时，改写成构造演练或待复核假设。
4. **每篇只承诺一层**：本地原型、CI 配置、在线部署、生产闭环分别标记，不用“真实/完整/已上线”替代证据。
5. **终篇不是发布许可**：系列收官只表示文章顺序结束；P0/P1 债务和外部证据仍按 `review.md` 验收矩阵管理。

## 已确认的阅读钩子

- TS 系列生产化篇 → 01：预算、幂等和取消变成服务需求。
- 01 → 02：架构决策落到 API 形状。
- 02 → 03：合同落到并发和失败测试。
- 03 → 04：本机测试落到根目录 CI。
- 04 → 05：CI 通过后重新定义“健康”。
- 05 → 06：指标路径进入构造事故演练。
- 06 → 07：反例修复后清点还缺的外部证据。

## 用户目标（2026-08-16）

> “我目标不仅是要扫盲。还是要能转成一个职业开发。”

职业开发的训练目标不是把教程写成生产声明，而是让读者能追问：这个判断由哪个工件支持？哪个反例还没测？哪一层需要真实数据库、平台或运行记录？
