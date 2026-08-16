# 当前博客文章质量复核与补充清单

> 审计快照：2026-08-16，本地工作区当前 checkout。本文记录的是需要纠正、补证或降级表述的事项，不替代文章本身，也不把缺失证据直接判成“历史数据造假”。共享实验和文章仍在修改中，因此所有结论都绑定到本次快照；修复后应在对应条目下追加新证据，而不是静默删掉旧结论。

## TL;DR：博客的上限很高，但近期批次的事实与证据没有跟上发布速度

全库已经形成明显优势：100 篇 production 文章、较完整的代码与互链、若干达到资深工程师转发标准的代表作，以及两个连续系列。问题不在“有没有内容”，而在**质量方差已经失控**：早期代表作通常能把问题、机制、实验、失败模式、取舍和一手资料闭环；2026-08-16 的 19 篇新文显著更短、更模板化，且部分核心结论已被当前代码、算术或官方语义直接反驳。

本次复核把问题分成三档：

- **P0：事实或实现冲突。** 当前 checkout 可直接复现反例、代码块无法成立、算术互相冲突，或文章对运行时语义的表述明确错误。修复前不应继续把相关系列称为“生产闭环”。
- **P1：证据链不完整。** 结论可能成立，但缺原始输出、版本、有效 workflow、部署记录、独立实验或生产边界，当前只能写成本地原型或待验证假设。
- **P2：编辑与方法问题。** 模板重复、弱标题、论题跨度大于证据强度、系列收尾过早。这些不会让单句代码立即报错，但会持续拉低读者信任。

按当前快照估计，博客整体约 **7/10**：代表作可到 **8.5–9/10**，近期两个系列多篇只有 **5.5–6.5/10**。这不是按篇幅打分，而是按“关键判断能否被当前工件、一手资料和可复现实验共同支持”评分。下一步应先清 P0，再补 P1，最后才继续扩篇。

## 一、审计边界：本文能证明什么，不能证明什么

### 1.1 本次检查的对象

本次检查覆盖：

- `content/posts/` 中当前 production 内容集合；
- 2026-08-16 发布的「从 Go 到 TypeScript」和「把原理变成服务」两个系列；
- `experiments/service/`、`experiments/ts-streams/`、`experiments/ts-agent-prod/`、`experiments/ts-interface-schema/` 等文章引用工件；
- 根目录 TypeScript、ESLint、Vitest、Next.js 构建边界；
- 文章里的数字、公式、命令、路径、代码块和“生产/真实/实测”措辞。

本次没有取得以下外部证据：

- 事故发生当时的原始 RSS/heap/wrk 输出和对应 commit；
- service workflow 的真实 GitHub Actions run；
- 可访问的 staging/production 服务、部署制品、回滚记录；
- PostgreSQL、Prometheus/OpenTelemetry 或多实例环境下的验证结果。

因此，本文会说“**当前工件无法支持旧结论**”，不会在没有原始材料时说“旧结果一定从未发生”。

### 1.2 证据等级

| 等级 | 含义 | 本文用法 |
| --- | --- | --- |
| E1：当前复现 | 在当前 checkout 运行命令得到稳定反例 | 404 延迟样本为 0、并发幂等返回两个 201 |
| E2：源码直证 | 代码控制流或配置路径直接决定结果 | workflow 不在根目录、`observe` 前提前返回 |
| E3：算术直证 | 不依赖环境即可重算 | 143.4MB / 3 万不是 9.5KB，5834→6274 不是 3% |
| E4：一手规范 | 官方规范、运行时文档或 SRE 定义 | goroutine、Go channel、Node timer、GitHub workflow 发现规则 |
| E5：待找回证据 | 当前无法判定历史事实，必须找原始输出 | 事故到底是 1.5 万还是 3 万订单、旧覆盖率是否对应旧 commit |

修复时的原则是：E1–E4 可以直接推动改文或改代码；E5 必须先找回证据，不能凭感觉从互相冲突的数字里选一个。

## 二、全库基线：覆盖面是优势，但不能替代逐篇可信度

### 2.1 结构覆盖

当前 production 内容扫描结果：

| 指标 | 数量 | 解读 |
| --- | ---: | --- |
| production 文章 | 100 | 内容体量已经足够形成专题资产 |
| 统一 `**TL;DR：**` | 99 | 格式执行度高；仍有 1 篇使用变体 |
| 标题含“参考资料”的章节 | 76 | 其中 74 篇使用精确标题 `## 参考资料`；近期系列明显低于历史基线 |
| 含代码块 | 96 | 强项；后续重点应从“有代码”转为“代码可独立验证” |
| 含 Mermaid 或图片 | 55 | 多组件系统仍有若干缺图 |
| 含表格 | 85 | 对比意识较强，但表内数字仍需和正文全链一致 |
| 含站内互链 | 91 | 系列导航较完整 |
| 无效 `/writing/...` 链接 | 0 | 当前 slug 闭合 |
| 丢失的 `/images/...` 文件 | 0 | 当前图片路径闭合 |

这些数字只证明结构覆盖，不能证明事实正确。例如，一篇文章可以同时拥有 TL;DR、代码块、表格和互链，但核心实验仍然比较了两个不同语义的操作。

### 2.2 新旧批次的质量方差

本次规模扫描先删除 frontmatter、fenced code、inline code 和链接 URL，再以“汉字数 + 英文单词序列数”作为近似单位；它只用于观察批次变化，不作为质量分数。换一套 Markdown 清洗规则会让绝对值小幅变化，但不会改变约 4.6 倍的批次差距：

| 批次 | 篇数 | 平均正文规模 | 图 | 参考资料章节 | 裸 `## 结论` |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-08-02 及以前样本 | 19 | 约 4,720 | 有 | 多数有 | 非统一模板 |
| 2026-08-16 | 19 | 约 1,027 | 0 | 3 | 19 |

进一步看：

- 「从 Go 到 TypeScript」11 篇按同一口径平均约 1,280；没有参考资料章节或正文外链，主要依赖仓库实验路径。
- 「把原理变成服务」7 篇按同一口径平均约 940；没有参考资料章节、没有系统图，全部依赖同一个持续演进的 `experiments/service/`。
- 2026-08-16 的 19 篇全部使用裸 `## 结论`，其中 15 篇包含“下一篇”或“下一步钩子”。连续性是优点，但重复节奏已经盖过了每篇应有的独立论证结构。

篇幅变短本身不是问题。真正的问题是：运行时、背压、幂等、CI/CD、SLO、事故复盘这些题的验证成本很高，而证据密度没有随题目难度增加。

### 2.3 问题索引

| ID | 优先级 | 核心事实 | 主要证据 | 修复前应采用的口径 |
| --- | --- | --- | --- | --- |
| P0-01 | 阻断 | 404 不进延迟分布；GET/POST 延迟混桶 | E1 + E2 | handler 指标原型 |
| P0-02 | 阻断 | 并发同 key 返回两个 201 和不同 orderId | E1 + E2 | 顺序重试演示 |
| P0-03 | 阻断 | workflow 不生效、无 build 产物、无 deploy step | E2 + E4 | CI/CD 设计草图 |
| P0-04 | 阻断 | 事故分母/增量/比例冲突，旧事故当前不可复现 | E2 + E3 + E5 | 待复核的事故演练 |
| P0-05 | 阻断 | goroutine 层级错误，`time.Sleep` 与忙等不等价 | E2 + E4 | 单场景观察 |
| P0-06 | 阻断 | 点时 heap 冒充峰值，channel 写成无界，因果未隔离 | E2 + E4 + E5 | 探索性实验 |
| P0-07 | 阻断 | 每 1k token 公式漏除 1000；幂等有并发窗口 | E2 + E3 | 模拟成本/单进程示例 |
| P0-08 | 阻断 | Zod 代码块缺导入；bundle/性能缺复现链 | E2 + E5 | 未独立验证的示例 |
| P1-01 | 高 | 文章覆盖率与当前工件漂移；根验证排除 experiments | E1 + E2 + E5 | 历史快照待找回 |
| P1-02 | 高 | service 缺数据库、安全、真实观测与部署闭环 | E2 | 本地教学原型 |
| P2-01 | 中 | 近期批次结构重复、引用和图示不足 | 全库扫描 | 逐篇重构而非批量补模板 |

## 三、P0-01：SLO 文章声称失败路径被计时，当前代码却明确漏记 404

涉及文件：

- [`content/posts/service-observability-slo.md`](content/posts/service-observability-slo.md)
- [`experiments/service/src/app.ts`](experiments/service/src/app.ts)
- [`experiments/service/src/metrics.ts`](experiments/service/src/metrics.ts)

### 3.1 文章的明确承诺

文章写了四个可以被验证的承诺：

1. GET 路由用 `performance.now()` 和 `try/finally` 包裹；
2. 404 提前返回也会进入延迟分布；
3. 180 次命中 + 20 次 404 后，延迟样本 `n = 200`；
4. 用 `p99 = 0.15ms` 和“200/200 有响应”判定延迟与可用性 SLO 达成。

文章甚至明确说：“否则延迟样本只覆盖成功路径，p99 是谎言。”这句话的判断本身是对的，但当前实现没有兑现它。

### 3.2 当前代码实际做了什么

`experiments/service/src/app.ts` 的 GET 路由控制流是：

```ts
const order = await store.get(c.req.param("id"));
if (!order) {
  metrics.inc("orders_get_not_found");
  c.status(404);
  return c.json(...); // 在 observe 之前返回
}
metrics.inc("orders_get_ok");
metrics.observe("orders_get_ms", performance.now() - t0);
```

当前文件没有文章展示的 `try/finally`。因此 404 只增加 counter，不增加 latency sample。

### 3.3 当前 checkout 的复现结果

在 `experiments/service/` 下使用 Node v24.19.0，向空 store 连续请求 10 个不存在订单，得到：

```text
missing-get metrics: {"counters":{"orders_get_not_found":10},"latencies":{"n":0,"p50":0,"p95":0,"p99":0}}
```

这不是“统计口径可能不同”，而是当前实现直接反驳文章的核心例子：10 个 404 的计数存在，延迟样本一个都没有。

### 3.4 同一分布还混入了不同操作

`Metrics.observe(name, ms)` 接收 `name`，但实现没有保存或按名称分桶，只把所有延迟推进同一个 `latencies` 数组：

```ts
observe(name: string, ms: number) {
  this.latencies.push(ms);
}
```

GET 与 POST 都调用 `observe` 后，`snapshot().latencies.p99` 代表的是两个操作的混合分布，不再是文章写的“下单 API p99”或“订单查询 p99”。参数 `name` 目前只是被忽略的标签。

### 3.5 SLO 判定本身也没有闭环

- `app.request()` 是进程内调用，不包含真实 socket、TLS、反向代理、网络排队和数据库延迟。它可以测 handler 级开销，不能直接命名为生产 API p99。
- 文章定义“订单查询可用性 99.9%/月”，却用 200 个进程内请求判定达成。200 个样本的最小失败率步长是 0.5%，无法验证 0.1% 的月度目标，更没有“月”这个时间窗口。
- “200/200 有响应”没有定义成功。若 SLI 是“格式正确请求得到非 5xx”，404 可以算服务可用；若 SLI 是“有效订单查询成功”，404 不能算。两种都可以设计，但必须先定义 good event，不能用“有响应”替代。
- `/healthz` 当前始终返回 `{ ok: true }`，没有检查 store 或外部依赖。文章表格却写“进程活着 + 依赖通”，后文又说 `/healthz` 不查业务，语义前后不一致。

Google SRE 对 SLI/SLO 的基本要求是：先定义可量化的 SLI，再给出目标和时间窗口；可用性通常以满足成功条件的请求占比计算，而不是“HTTP 层有返回即可”。参见 [Google SRE：Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)。

### 3.6 应补内容与验收条件

需要同时改代码和文章：

- 用 middleware 或 `try/finally` 覆盖成功、404、400、500；验证任何退出路径都记录时长。
- 让 histogram 真正按 operation/status class 分开，例如 `orders_get_ms{outcome="ok|not_found|error"}`，不要把 GET/POST 混成一个数组。
- 明确定义 SLI 的 numerator、denominator、排除条件和 28/30 天窗口，再计算 error budget。
- 把 in-process 数字改称“handler 微基准”；若要写 API p99，使用真实监听端口、固定并发、预热、重复轮次和数据库依赖。
- 分开 liveness 与 readiness：`/healthz` 只证明进程活着；需要依赖检查时另设 `/readyz`，并写清失败语义。

验收至少包括：

| 场景 | counter | latency | HTTP 结果 |
| --- | --- | --- | --- |
| GET 命中 | `get_ok +1` | 对应分布 `n +1` | 200 |
| GET 不存在 | `get_not_found +1` | 对应分布 `n +1` | 404 |
| POST 校验失败 | `validation_failed +1` | 对应分布 `n +1` | 400 |
| store 抛错 | `internal_errors +1` | 对应分布 `n +1` | 500 |

完成标准不是“测试绿色”，而是四条路径的指标总数、状态分类和原始输出能逐项对上。

## 四、P0-02：当前幂等实现只能挡顺序重试，挡不住并发同键请求

涉及文件：

- [`content/posts/service-api-shape.md`](content/posts/service-api-shape.md)
- [`experiments/service/src/app.ts`](experiments/service/src/app.ts)
- [`experiments/service/src/store.ts`](experiments/service/src/store.ts)
- [`experiments/service/src/app.test.ts`](experiments/service/src/app.test.ts)

### 4.1 当前控制流存在 check-then-act 竞争

POST 路由先查后写：

```text
findByKey(key)
  → 不存在
  → 构造新 order
  → saveByKey(key, order)
  → 返回自己构造的 order，状态 201
```

`saveByKey` 虽然再次检查 `byKey.has(key)`，但返回值是 `void`。竞争失败的调用者不知道自己的 order 没被保存，仍然把它作为新建成功响应返回。

### 4.2 当前 checkout 的并发反例

同一个空 store、同一个 `idempotencyKey`，并发发两个 POST：

```text
statuses: 201 201
bodies: {"orderId":"A-1786853888916",...} {"orderId":"A-1786853888922",...}
```

两个调用都宣称创建成功，且客户端拿到两个不同订单号。store 最终最多只保留其中一个映射，另一个响应描述的是一个没有成为权威结果的 order。现有 `app.test.ts` 是先 `await r1`、再 `await r2` 的顺序测试，因此它只能证明“第二个串行重试能命中已有结果”。

### 4.3 即使修掉单进程竞争，当前存储仍不是生产幂等

- `Map` 随进程重启丢失；多实例之间也不共享。
- 容量驱逐会静默删除幂等记录，之后同 key 可以重新产生副作用；当前没有 TTL 或业务保留期合同。
- 没有 request fingerprint。同 key 携带不同 body 时，系统无法返回 409/422，也无法指出客户端错误复用了 key。
- 没有 `IN_PROGRESS / SUCCEEDED / FAILED` 状态；长请求、超时后重试和未知结果无法表达。
- `Date.now()` 不是可靠的唯一订单号生成器；同一毫秒内可能碰撞。
- 驱逐时 `Array.shift()` 加遍历 `byKey` 是线性成本，容量越大越容易把“有界内存”换成尾延迟尖峰。

### 4.4 应补内容与验收条件

生产语义至少需要：

1. 在权威数据库里用唯一约束原子 claim 幂等键；
2. 保存 request fingerprint、执行状态、最终 status/body 和过期时间；
3. 同 key 同 payload 重放权威响应；同 key 不同 payload 明确冲突；
4. 对执行中、失败可重试、结果未知分别给出合同；
5. 多实例和重启后仍成立。

最低验收矩阵：

| 场景 | 预期副作用次数 | 预期响应 |
| --- | ---: | --- |
| 顺序同 key、同 body | 1 | 第二次重放第一次结果 |
| 100 并发同 key、同 body | 1 | 全部拿到同一权威 order/result |
| 同 key、不同 body | 0 或 1（按首个 claim） | 其余明确 409/422，不静默复用 |
| 首次执行中连接断开后重试 | 1 | 返回 in-progress 或最终结果 |
| 进程重启后重试 | 1 | 仍能重放 |
| 两实例同时接收同 key | 1 | 数据库唯一约束裁决 |

文章在这些证据补齐前，应把当前版本称为“顺序重试演示”，不能称为生产幂等实现。

## 五、P0-03：service workflow 不是仓库生效管线，也没有完成 build 与 deploy

涉及文件：

- [`content/posts/service-ci-cd.md`](content/posts/service-ci-cd.md)
- [`experiments/service/.github/workflows/service-pipeline.yml`](experiments/service/.github/workflows/service-pipeline.yml)
- [`experiments/service/package.json`](experiments/service/package.json)
- [`tsconfig.json`](tsconfig.json)

### 5.1 文章把设计草图写成了“真实配置”

文章的 title/description/TL;DR 把 service 配置描述为：

- Node 20/22/24 矩阵测试；
- test → build → deploy 依赖门；
- 上传 `dist` 制品；
- 部署后健康检查；
- bug 在 merge 前被机器拦住。

当前仓库只能证明 YAML 文件存在，不能证明这些 job 被 GitHub 执行过。

### 5.2 workflow 放在 GitHub 不会发现的位置

GitHub Actions 从**仓库根目录**的 `.github/workflows/` 读取 workflow。当前文件位于：

```text
experiments/service/.github/workflows/service-pipeline.yml
```

因此它不是本仓库的生效 workflow。参见 [GitHub Docs：Workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows)。

### 5.3 即使把文件原样移到根目录，命令仍会在错误目录执行

workflow 没有 `defaults.run.working-directory`，各 step 也没有 `working-directory` 或 `npm --prefix experiments/service ...`。如果直接移到根 `.github/workflows/`：

- `npm ci` 会安装博客根依赖；
- `npm test` 会运行博客测试，不是 service 的 11 个测试；
- `npx tsc --noEmit` 会读取根 `tsconfig.json`。

当前从 `experiments/service/` 执行 `npx tsc --showConfig` 也会向上找到根配置，而根配置明确 `exclude: ["node_modules", "experiments"]`。输出的 `files` 全是博客应用和测试文件，没有 service 源码。因此文章中的 typecheck step 当前没有 typecheck service。

### 5.4 build 和 deploy 都是空壳

- `experiments/service/package.json` 只有 `test: "vitest run"`，没有 `build`。
- `npm run build --if-present` 会成功跳过，不生成 `dist/`。
- workflow 随后仍尝试上传 `dist/`，当前本地检查显示 `dist directory: absent`。
- deploy job 只有“下载 artifact”和“curl healthz”，没有任何部署命令。
- environment URL 引用了 `${{ steps.deploy.outputs.url }}`，但不存在 `id: deploy` 的 step。

所以当前 pipeline 既没有可部署制品，也没有把制品发布到任何环境。健康检查只能检查 `PROD_URL` 指向的既有服务，不能证明本次 commit 已部署。

### 5.5 运行时矩阵也没有当前证据

本机默认 `/usr/local/bin/node` 是 v18.13.0，service 的 `npm test` 在 Vitest/rolldown 启动阶段失败：

```text
SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
```

显式切到 Node v24.19.0 后 11 个测试通过。这只证明 v24 当前可跑，不证明 Node 20/22/24 三档都在 Actions 通过。Node 支持范围需要 `engines`、版本文件和真实矩阵 run 共同约束。

### 5.6 应补内容与验收条件

- 把 workflow 放到根 `.github/workflows/`，并显式设置 service 工作目录。
- 给 service 独立 `tsconfig.json`、`typecheck`、`build`、`test` 脚本和 Node `engines`。
- 构建出明确、非空、可启动的制品或容器；记录 artifact 名称、内容、版本和校验值。
- 增加真实 deploy step，并给它 `id: deploy`；部署输出 URL 必须来自该 step。
- health check 针对本次部署版本；最好同时验证 `/healthz`、`/readyz` 和一个只读业务 smoke test。
- 写清数据库迁移、向前兼容、失败回滚和旧制品重放策略。
- 保存 Actions run URL、三个 Node job 日志、artifact 下载结果、staging 发布记录和一次回滚演练。

只有完成这些，文章才可以继续使用“真实 service 管线”“一条 commit 到生产”和“由机器决定能否进 main”等措辞。

## 六、P0-04：事故文章的分母、内存增量和吞吐比例互相冲突，当前命令也无法复现旧事故

涉及文件：

- [`content/posts/service-incident-drama.md`](content/posts/service-incident-drama.md)
- [`experiments/service/src/app.ts`](experiments/service/src/app.ts)
- [`experiments/service/src/app-buggy.ts`](experiments/service/src/app-buggy.ts)
- [`experiments/service/src/store.ts`](experiments/service/src/store.ts)
- [`experiments/service/scripts/postmany.lua`](experiments/service/scripts/postmany.lua)

### 6.1 同一事故至少有五组不能同时成立的数字

| 位置/说法 | 当前数字 | 可直接重算的结果 | 问题 |
| --- | --- | --- | --- |
| 冷启动到 30 秒 | 97.8MB → 241.2MB | 增量 143.4MB | 这一组算术成立 |
| TL;DR 分母 | 143MB / 1.5 万订单 | 约 9.56KB/订单 | 与同句“约 3 万订单”冲突 |
| 若按 3 万订单 | 143.4MB / 3 万 | 约 4.78KB/订单 | 不是文章写的 9.5KB |
| 时间线 | “30 秒 +180MB” | 97.8→241.2 只增 143.4MB | +180MB 没有对应基线 |
| 根因段 | 3 万 × 9.5KB | 约 285MB | 与实测增量 143.4MB 冲突，除非另有未说明口径 |
| 吞吐表 | 5834 vs 6274 req/s | 相对 5834 增加约 7.54% | 不是“差 3%” |
| TL;DR 吞吐 | 6274 vs 6301 req/s | 相差约 0.43% | 与表格使用了另一组对照 |

另外，文中 15 秒为 241.2MB、30 秒为 233.4MB，却称“斜率稳定”。这两个点是绝对 RSS，后一点还更低；没有各时刻累计订单数、GC 状态和多次重复，无法由这两个点推出“每订单稳定线性增长”。

### 6.2 当前仓库不能按正文命令复现“修复前”版本

- 正文让读者运行 `node src/app.ts`，但当前 `app.ts` 使用的是有界 `BoundedInMemoryStore`，不是事故中的双 Map 无界版本。
- 仓库保留了 `app-buggy.ts`，但它导入当前 `store.ts` 已不存在的 `InMemoryOrderStore`。Node v24.19.0 当前启动结果为：

```text
SyntaxError: The requested module './store.ts' does not provide an export named 'InMemoryOrderStore'
```

- `app-buggy.ts` 的 body schema 也没有 `idempotencyKey`，后面却读取 `v.idempotencyKey`，说明它不是一个自洽的历史快照。
- 正文命令引用 `/tmp/postmany.lua`，仓库实际脚本在 `experiments/service/scripts/postmany.lua`，文中没有生成或复制 `/tmp` 文件的步骤。
- 正文说“500 插入后两表都 ≤100”的单测已验证；当前 `store.test.ts` 只有 3 个测试，没有这条 500 次插入回归测试。

因此，现在既无法复现无界版本，也无法用当前测试证明修复终态。把已经修过的共享代码继续演进，会让历史文章失去证据锚点。

### 6.3 不应怎样修

不能直接把“1.5 万”改成“3 万”，也不能直接把 9.5KB 改成 4.8KB。可能存在多种历史情况：

- 30 秒共 3 万请求，但只有 1.5 万成功创建了唯一订单；
- wrk 请求总数、2xx 数、唯一 idempotency key 数不是同一分母；
- 143.4MB 是某一轮，285MB 是另一轮或 heap/RSS 不同口径；
- 文章把 bug/control 两组数字交叉粘贴了。

没有原始输出前，任何一种选择都只是猜测。

### 6.4 应补内容与验收条件

先找回或重跑：

- 精确 commit/源码快照：unbounded、half-fixed、fully-fixed 三个可启动版本；
- Node/V8、OS、CPU、内存、启动参数和 GC 参数；
- wrk 命令、Lua 文件、并发、持续时间、总请求、成功响应、失败响应、唯一订单数；
- 每 1–5 秒 RSS、heapUsed、heapTotal、external、订单表大小、幂等表大小；
- 至少 3 轮重复和一个空载/有界 control；
- 修复前后的 heap snapshot 或 allocation profile；
- 500/10,000 次插入后的双表容量与映射一致性测试。

最终文章必须让 title、description、TL;DR、时间线、表格、公式和结论使用同一组分母与单位。若旧证据找不回，应把它改写为“构造事故演练”，删除“真实事故”和无法证实的精确数字。

## 七、P0-05：Go 与 Node 的对照混淆了用户态调度、操作系统线程和不同类型的阻塞

涉及文件：

- [`content/posts/typescript-event-loop-vs-gmp.md`](content/posts/typescript-event-loop-vs-gmp.md)
- `experiments/ts-event-loop/`

### 7.1 “goroutine 是内核级”是错误表述

goroutine 由 Go runtime 管理，多个 goroutine 复用到多个操作系统线程；操作系统调度线程，不直接把 goroutine 当作内核调度实体。Go runtime 支持抢占，不等于 goroutine 变成“内核级线程”。可核对：

- [Go FAQ：goroutines](https://go.dev/doc/faq#goroutines)
- [Effective Go：Concurrency](https://go.dev/doc/effective_go#concurrency)

文章应改为类似：**Go runtime 在用户态调度 goroutine，并把可运行 goroutine 复用到 OS threads；Node 主事件循环通常在一个 JavaScript 线程上推进任务，CPU 密集同步代码会阻塞该线程。**

### 7.2 当前实验比较的不是同一件事

文章用：

- Go：一个 goroutine `time.Sleep(50ms)`；
- Node：主线程同步忙等 50ms。

`time.Sleep` 的语义是把当前 goroutine 暂停并让 runtime 调度其他 goroutine；同步忙等的语义是持续占用 JavaScript 主线程。这个实验能说明“Node 主线程被同步 CPU 工作占住时 timer 会延迟”，不能证明“Go 抢占而 Node 不抢占”这一完整结论。

### 7.3 timer 结论也应收窄

Node 官方文档只把 timeout delay 当作最早阈值，不保证精确执行时间或绝对顺序；顶层 `setTimeout(0)` 与 `setImmediate()` 的先后会受事件循环进入阶段和环境影响，在 I/O callback 内则有更稳定的阶段关系。参见 [Node.js Timers](https://nodejs.org/api/timers.html)。

所以文章不应把一次 52ms 输出写成普遍固定数字，也不应把顶层先后顺序写成无条件规则。

### 7.4 应补的等价实验矩阵

| 负载 | Go | Node | 要回答的问题 |
| --- | --- | --- | --- |
| 协作等待 | `time.Sleep` / channel receive | `await setTimeout` / Promise-based I/O | 主动让出后其他任务能否推进 |
| CPU 忙等 | goroutine CPU loop，分别设置 `GOMAXPROCS=1/N` | 主线程 CPU loop | 单执行资源与多执行资源的差异 |
| CPU 下放 | 多 goroutine/OS threads | `worker_threads` | 如何获得并行 CPU 能力 |
| 阻塞系统调用 | 明确 syscall/文件/网络场景 | 同语义 API，区分同步与异步版本 | runtime/libuv 如何处理阻塞 |

每组记录 Go/Node 版本、核心数、`GOMAXPROCS`、预热、重复次数、timer lateness 分布和 CPU 使用率。文章结论应按场景说话，避免把“一个事件循环线程”外推成“Node 整个运行时永远单线程”。

## 八、P0-06：背压文章把点时内存写成峰值，把有限 channel 写成无界，并过度归因 `Readable.from`

涉及文件：

- [`content/posts/typescript-streams-backpressure.md`](content/posts/typescript-streams-backpressure.md)
- [`experiments/ts-streams/memory.ts`](experiments/ts-streams/memory.ts)
- [`experiments/ts-streams/memory2.ts`](experiments/ts-streams/memory2.ts)

### 8.1 当前程序没有测“峰值”

`memory2.ts` 的 `printMem` 会先调用 `global.gc()`，再读取一次 `process.memoryUsage().heapUsed`。这得到的是**强制 GC 后某个时刻仍被保留的 V8 heap**，不是运行过程中的 peak heap，更不是进程 RSS 峰值。

文章把 208.9MB 和 3.8MB称为“峰值内存差 55 倍”，超出了测量本身。若要测峰值，需要在运行期间采样或使用 profiler；若保留当前程序，只能写“两个阶段完成并 GC 后的 heapUsed 快照”。

### 8.2 两种方法没有进程隔离

`memory.ts` 和 `memory2.ts` 都先构造 200 万条数组，再在同一函数、同一进程里运行流式版本。`all` 变量仍处于词法作用域，JIT 是否把它视为死值属于实现细节；前一阶段的 heap expansion、GC 周期和内存页也会影响后一阶段。即使最终数字看起来合理，它也不是严格的单变量对照。

正确做法是让 `array`、`async-generator`、`Readable.from`、Web Streams 和 socket pipeline 分别在新进程运行，输入生成方式、记录大小和消费者延迟一致。

### 8.3 当前工件不能支持“`Readable.from` 切断背压，生产者全速跑”的因果结论

首轮代码确实用了 `Readable.from(asyncGenerator)`，但没有：

- 记录内部队列长度；
- 改变 `highWaterMark` 做对照；
- 给消费者加入稳定延迟；
- 单独运行 direct generator 与 `Readable.from`；
- 保存导致 806.7MB 的原始采样曲线。

所以当前证据最多说明“那次组合实验出现高内存”，不能把原因唯一归给 `Readable.from`。Node Readable 本身有有限缓冲和背压协议；是否把上游拉满取决于实现、object mode、highWaterMark 和消费方式。应以 [Node.js Streams](https://nodejs.org/api/stream.html) 的契约为准，再用队列/拉取次数实验定位。

### 8.4 Go channel 的描述明确错误

文章写“`chan` 是无界缓冲的 push”。Go 原生 channel 不是无界队列：

- `make(chan T)` 或容量 0 是无缓冲 channel；
- `make(chan T, n)` 的容量是创建时给定的有限非负整数；
- 无缓冲 send 需要 receiver 就绪；有缓冲 channel 满时 send 阻塞。

参见 [Go Language Specification：Channel types](https://go.dev/ref/spec#Channel_types)。文章同一句又写“除非缓冲满才阻塞”，这也从内部反证了“无界”一词。

### 8.5 “恒为 1 条”和 `emitToUI` O(1) 也需要边界

直接迭代 async generator 通常是 demand-driven：消费者下一次请求前，generator 不继续产生下一项。但“内存恒为 1 条”仍过强，因为：

- 当前对象、闭包、批处理逻辑可能保留多条；
- `emitToUI` 可能把数据推入另一个无界队列；
- HTTP/SSE/socket writable 有自己的缓冲；
- 不等待 `drain`、`writer.ready` 或等价信号，只是把积压从本地数组搬到下游。

文章需要沿完整链路说明背压是否传播，而不是只看 `for await` 这一层。

### 8.6 应补内容与验收条件

- 每种模式独立进程；固定 Node 版本、记录大小、总量和 consumer delay。
- 同时采样 `rss`、`heapUsed`、峰值、结束后 GC 值和吞吐。
- 对 `Readable.from` 至少测 3 个 `highWaterMark`，记录 generator yield 次数与 consumer 完成次数的最大差。
- 加一个故意不等待 `drain` 的 Writable 反例，再加正确等待的版本。
- 区分 direct async generator、Node Readable、Web Streams、HTTP/SSE socket 四层语义。
- 所有“55 倍”“806.7MB”等数字保留原始输出与命令；无法找回就删除精确值。

## 九、P0-07：Agent 成本公式漏除以 1000，幂等示例也仍有并发窗口

涉及文件：

- [`content/posts/typescript-agent-production.md`](content/posts/typescript-agent-production.md)
- [`experiments/ts-agent-prod/prod.ts`](experiments/ts-agent-prod/prod.ts)

### 9.1 成本金额被放大了 1000 倍

代码注释说价格单位是“每 1k token”，公式却直接做：

```ts
inputTokens * 0.01 + outputTokens * 0.03
```

若费率确实是输入 `$0.01 / 1k tokens`、输出 `$0.03 / 1k tokens`，正确公式应是：

```text
(inputTokens / 1000) × inputRatePer1K
+ (outputTokens / 1000) × outputRatePer1K
```

因此：

```text
500 input + 200 output = 0.5×0.01 + 0.2×0.03 = $0.011
300 input + 150 output = 0.3×0.01 + 0.15×0.03 = $0.0075
当前示例整轮 $37.000 应为 $0.037（沿用同一模拟费率）
```

文章的 `$11.000`、`$7.500`、`$37.000` 都是同一个单位错误。费率本身还没有注明模型、币种、价格日期或“纯模拟”，不应让读者误以为是某个真实模型的当前报价。

### 9.2 `idempotent` 只能挡串行重试

当前实现先检查 set，再 `await task()`，成功后才 `executed.add(key)`：

```ts
if (executed.has(key)) return;
await task();
executed.add(key);
```

两个并发调用都能在第一个 `await` 前看到“不存在”，然后各执行一次。代码注释还写“执行前记录”，与实现不一致。

`runOnce` 能在单进程、同一个 Map 生命周期内合并并发 Promise，但它也有明确边界：进程重启即丢失；多实例不共享；第一个执行失败时所有等待者共享失败；Promise settle 后 key 立即删除，随后重试会重新执行。这些不是 bug，但必须写成语义合同。

### 9.3 应补内容与验收条件

- 明确成本是“模拟费率”还是实际模型价格；实际价格必须记录模型、单位、币种和核对日期。
- 金额建议使用整数微美元或十进制定点数，避免浮点累计误差。
- 增加预算维度：per request、per user、per tenant、per day，并定义超限后的终止状态。
- 并发幂等必须复用原子存储设计，不要用 `Set` 冒充生产解法。
- 测试 10/100 并发、任务失败、连接取消、进程重启、同 key 不同 payload 和成本上限。

## 十、P0-08：Zod 展示代码缺少 `z` 导入，性能与体积结论也没有完整复现链

涉及文件：

- [`content/posts/typescript-interface-schema-zod.md`](content/posts/typescript-interface-schema-zod.md)
- [`experiments/ts-interface-schema/main.ts`](experiments/ts-interface-schema/main.ts)
- `experiments/ts-interface-schema/sizes/`

### 10.1 正文代码块不能按原样通过 TypeScript 检查

正文使用 named imports：

```ts
import { discriminatedUnion, object, string, literal } from "zod/v4";
```

但后面写：

```ts
type ToolCall = z.infer<typeof ToolCallSchema>;
```

这个作用域里没有 `z`。最直接的自洽写法是统一使用：

```ts
import { z } from "zod/v4";

const ToolCallSchema = z.discriminatedUnion(/* ... */);
type ToolCall = z.infer<typeof ToolCallSchema>;
```

仓库实验中的 `main.ts` 恰好使用了 `import { z } from "zod"`，但“另一个文件可以运行”不能替正文代码块通过。

### 10.2 “没实测不写数字”与下一句互相矛盾

正文先说“没实测不写数字”，随后又说“大 schema 下比手写 typeof 慢一个量级”“通常快一个量级”。这仍然是数量级性能结论，需要 benchmark、schema 规模、输入分布、warmup、Node/V8 版本和重复结果。否则应删掉“一个量级”，只保留“热路径需基准测试”。

### 10.3 619B / 327KB / 68KB 缺少可复现命令

仓库有三个 `sizes/*.ts` 输入文件，但当前没有：

- esbuild 安装与锁定脚本；
- `platform`、`target`、`format`、`minify`、tree-shaking、external 等完整参数；
- 输出文件或 metafile；
- raw、gzip、brotli 到底采用哪一种口径；
- 可一键重算三行表格的命令。

`main.ts` 当前打印的是 `node_modules/zod/package.json` 文件本身的大小，这不是 bundle size，也不能生成文章中的 327KB/68KB。现有数字可能来自之前的手工命令，但当前仓库没有保存证据。

### 10.4 库间迁移结论过宽

“四者核心 API 高度相似，换库主要换 API 命名，语义一致”忽略了错误模型、转换/精炼、async validation、JSON Schema 互操作、类型推导性能和 bundle 策略差异。可以给选型概览，但“语义一致、迁移只换名字”需要真实迁移 diff，不能凭表格概括。

### 10.5 应补内容与验收条件

- 从 Markdown 提取 TypeScript code fences，并在临时工程中逐块 `tsc --noEmit`；省略上下文的块显式标“节选/伪代码”。
- 加固定版本的 `npm run bundle:sizes`，一次生成三份 bundle、metafile 和 Markdown 表。
- 分别报告 raw/minified/gzip，明确 browser/Node、ESM/CJS target。
- 性能结论增加 `tinybench`/同类基准和统计分布，或删除数量级。
- 库间迁移至少选择同一 schema 做一份代码与错误输出对照，不再写“语义一致”的总括句。

## 十一、P1-01：测试篇的历史数字与当前工件漂移，根测试又覆盖不到 experiments

涉及文件：

- [`content/posts/service-testing-strategy.md`](content/posts/service-testing-strategy.md)
- [`experiments/service/package.json`](experiments/service/package.json)
- [`tsconfig.json`](tsconfig.json)
- [`eslint.config.mjs`](eslint.config.mjs)

### 11.1 当前重跑结果与文章表格不同

文章记录：

```text
11 tests, 1.17s
Statements 83.67%
Branches   90%
Lines      84.44%
```

当前使用 Node v24.19.0、Vitest 4.1.10 执行 `npm test -- --coverage`：

```text
Test Files  3 passed (3)
Tests       11 passed (11)
Duration    423ms

Statements  71.91% (64/89)
Branches    60%    (15/25)
Functions   60.86% (14/23)
Lines       77.21% (61/79)
```

运行时长受机器、缓存和 Vitest 版本影响，差异本身不构成错误；覆盖率分母和比例变化说明 service 代码已经演进，而文章没有绑定旧 commit 或保存旧 raw report。当前无法断言旧数字当时是假的，只能断言**当前工件不再复现它们**。

文章表格还写“合计 2 个被测文件”，但当前 coverage 覆盖 `app.ts`、`metrics.ts`、`store.ts` 三个文件，应复核这是旧版本口径还是笔误。

### 11.2 根目录绿色不能替 experiments 背书

- 根 `tsconfig.json` 排除了 `experiments`。
- `eslint.config.mjs` 忽略 `experiments/**/*.js` 和 `experiments/**/*.ts`。
- 根 `npm test` / `npm run build` 验证的是博客内容解析、组件和静态生成，不会逐个编译运行实验。
- service 只有 test script，没有独立 typecheck/build；其他实验目录也多为散落的 `.ts/.js`，没有统一验证入口。

因此，“博客根测试 41 个全绿”和“100 篇文章能静态构建”只能证明站点工件完整，不能证明文章内每个实验、代码块和输出正确。

### 11.3 应补内容与验收条件

- 每篇实验保存 `evidence/<slug>/<date>/`：环境、命令、stdout、stderr、派生表格和源码 commit。
- 为每个实验提供独立 `package.json`/锁文件或统一 workspace，固定 Node/Go 与依赖版本。
- 增加根级 `verify:experiments`，显式遍历实验；不要靠根 `tsconfig` 偶然发现。
- Markdown code fence 加编译测试，命令块加路径存在性/最小 smoke test。
- 文章引用结果时指向 evidence snapshot；共享 demo 后续变更不覆盖旧证据。

## 十二、P1-02：订单服务仍是本地教学原型，文章需要统一生产边界

当前 `experiments/service/` 的价值是把 API、store、测试、指标和 workflow 概念放进一个连续例子。这是很好的教学骨架，但它目前没有达到“生产服务”所需的权威性和运行闭环：

| 维度 | 当前状态 | 生产缺口 |
| --- | --- | --- |
| 数据 | 单进程 `Map` | 数据库 schema、迁移、事务、备份恢复 |
| 幂等 | 非原子 check-then-act | 唯一约束、状态、结果重放、TTL、多实例 |
| 身份 | 无认证/授权 | principal、tenant、RBAC/ABAC、审计 |
| 错误 | 500 直接回传 `err.message` | 内部错误脱敏、trace id、结构化日志 |
| 观测 | 进程内数组 + JSON endpoint | Prometheus/OTel、标签基数、持久监控、告警 |
| 健康 | 始终 `ok: true` | liveness/readiness、依赖探测、启动/排空 |
| 部署 | 无生效 workflow/制品/deploy | root CI、容器/制品、环境、迁移、回滚 |
| 容量 | 单次本机实验 | 真实读写比、稳态、峰值、故障注入 |
| 生命周期 | 无 graceful shutdown | 信号、连接排空、超时、取消、资源关闭 |

这不要求每篇都把所有能力一次写完。要求是统一措辞：

- 当前可以称“本地教学原型”“进程内演示”“候选设计”；
- 只有对应证据存在时才称“真实管线”“已经部署”“生产幂等”“生产闭环”；
- 系列路线图应明确已完成、仅设计、未验证和暂不覆盖的边界。

## 十三、P2-01：近期文章模板复用过度，形式开始替代论证

近期系列的共同优点是：开头快、数字多、代码落仓、相互链接完整、读者能连续读下去。问题是同一写法被重复到可预测：

```text
前篇留下钩子
→ 本篇一句核心结论
→ 三条纪律/三本账
→ 一张总表
→ 裸“结论”列 4–5 点
→ 下一篇钩子
```

这种结构适合少数教程，但不适合所有文型：

- 运行时原理题需要“等价实验 → 机制 → 边界 → 反例”；
- 事故题需要“时间线 → 证据 → 假设淘汰 → 根因 → 修复验证”；
- 选型题需要“语义承诺 → 场景矩阵 → 取舍”；
- 生产化文章需要“承诺 → 工件 → 故障测试 → 运行证据”。

同批 19 篇全部用裸 `## 结论`、15 篇包含“下一篇”或“下一步钩子”、没有图，说明结构是批处理生成的，而不是由内容决定。修订时无需机械加长，应该让每篇的证据形状决定结构。

### 13.1 近期引用不足尤其影响运行时与框架结论

TypeScript/Node/Go runtime、Zod bundle、GitHub Actions、SLO 等都属于会随版本变化或需要规范定义的事实。近期系列主要互引仓库文章和实验，却很少给官方文档、源码、版本发布日期或可重算脚本。读者无法区分：

- 哪些是语言/运行时保证；
- 哪些只是当前 Node/V8 版本的观察；
- 哪些是作者的设计建议；
- 哪些是模拟数据。

后续修订应在关键判断旁就近放一手来源，参考资料章节只做汇总，不要让读者自己猜哪条来源支持哪句话。

## 十四、修复顺序：先恢复可信度，再扩展主题

### 14.1 第一阶段：冻结新篇，清理可直接确认的 P0

建议按以下顺序处理，因为前项会影响后项的证据：

1. 修正 Agent 成本公式、Zod 导入、goroutine/channel 等无需历史数据即可确认的错误。
2. 修正 metrics 失败路径和 named histogram，补四类状态测试。
3. 修正并发幂等合同与测试；若暂不引数据库，明确降级成原型。
4. 把 service workflow 降级描述为草图，或真正接入根 CI 后再恢复“真实管线”措辞。
5. 事故篇先标记“数字待复核”；找到 raw evidence 后统一重算，找不到就重做实验。
6. 重做 streams 与 event-loop 的等价实验，再重写结论。

### 14.2 第二阶段：建立不会随共享代码漂移的证据工件

建议每篇实验形成固定目录：

```text
evidence/<slug>/<run-date>/
├── README.md          # 假设、环境、完整命令、口径
├── environment.txt   # OS/CPU/runtime/dependency versions
├── raw/              # 原始 stdout、CSV、profiles
├── derive.*          # 从 raw 生成表格/图的脚本
└── result.md          # 自动生成、供文章引用的数字
```

文章只引用 `result.md` 中可重算的结果。共享实现可以继续演进，但旧 evidence snapshot 不修改；需要更新数字就新增 run-date，并写 `updatedAt`。

### 14.3 第三阶段：把订单原型补成真正可验证的服务

沿用当前订单服务，不另造 demo：

1. PostgreSQL schema、迁移、事务与原子幂等；
2. root-level CI、独立构建、容器或制品、staging deploy；
3. Prometheus/OpenTelemetry RED 指标、SLI/SLO、告警和 trace；
4. 认证、租户、密钥、输入上限和威胁模型；
5. 真实读写比容量测试、数据库故障、超时、重启和回滚演练。

这五项形成「系列承诺 → 代码 → 测试 → 运行记录」矩阵后，才适合把系列称为“把原理变成服务”的生产闭环。

## 十五、质量债清零后的拓展方向

### 15.1 深化 Go ↔ TypeScript 运行时对照

不是继续罗列语法差异，而是做四组可比实验：

- Go scheduler / Node event loop / worker threads 的 CPU 延迟分布；
- async generator / Node Readable / Web Streams / HTTP socket 的背压传播；
- ESM/CJS 双包、module resolution、Node 原生 TypeScript 与构建产物合同；
- 取消、deadline、structured concurrency 在 Go context 与 JS AbortSignal 中的语义差异。

每篇只回答一个可复现问题，避免“一篇解释整个运行时”。

### 15.2 扩展职业工程链条，但每篇必须产生真实变更

代码评审、重构安全网、遗产代码接手、ADR 后置评估都值得写。约束是：每篇必须落到当前订单服务的一次真实改动，至少保留一个失败测试或被否决方案，而不是写成通用清单释义。

可按下面顺序展开：

1. “一次幂等 PR 怎么评审”：用并发反例审 API 与数据库事务；
2. “重构 store 的安全网”：characterization test、并发测试、迁移前后不变量；
3. “接手一个没有证据的事故项目”：如何重建版本、命令、原始输出；
4. “ADR 六个月后复盘”：哪些假设成立、哪些成本被低估、是否撤销决策。

### 15.3 增加「证据工程」系列

这是当前博客最有潜力形成差异化的方向：

- benchmark 如何只改变一个变量；
- 如何识别客户端、协议限制和服务端瓶颈；
- RSS、heapUsed、峰值、GC 后保留量和增长斜率分别回答什么；
- p99 需要多少样本，直方图桶如何设计；
- 如何保存 raw output、derive script 和环境快照；
- 如何从源码、规范、RFC 建立“主张 → 一手证据”链。

它既能修复本次暴露的短板，也比再写一篇泛化原理综述更有独特价值。

### 15.4 回到真实事故与源码考古

优先选择确有日志、commit、profile、packet capture 或源码位置的题。立项前先回答：

> 这篇新增了哪份别人拿不到，或多数人不愿花时间整理的证据？

如果答案只是“把官方文档换成中文再讲一遍”，应缩小问题或换题。

## 十六、逐项验收矩阵

| ID | 文章/主题 | 完成所需代码 | 完成所需测试 | 完成所需外部/原始证据 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| P0-01 | SLO/metrics | 全路径计时、按操作分布、liveness/readiness 分离 | 200/404/400/500 指标测试 | 真实端口压测、SLI 窗口定义 | 本地部分修复；真实端口/窗口待补 |
| P0-02 | service 幂等 | 数据库原子 claim、fingerprint、结果重放 | 并发/重启/多实例/冲突 | PostgreSQL 运行记录 | 单进程本地修复；持久化语义待补 |
| P0-03 | CI/CD | 根 workflow、service build、真实 deploy | Node 矩阵、smoke、rollback | Actions run、artifact、部署 URL | 根 workflow/build 已补；Actions/deploy 待补 |
| P0-04 | 事故复盘 | 可启动的三阶段历史版本 | 容量与映射一致性回归 | wrk/RSS/heap/profile 原始输出 | 历史事实未修；构造演练可重跑 |
| P0-05 | event loop/GMP | 等价实验程序 | 多轮延迟分布 | Go/Node 官方资料、环境快照 | 语义/最小实验已修；多轮分布待补 |
| P0-06 | streams | 独立模式、队列/峰值采样 | HWM/slow consumer/drain 对照 | Node/Go 规范、raw memory series | 独立进程/HWM 已补；完整下游链路待补 |
| P0-07 | Agent 成本/幂等 | 正确单位、定点金额、原子语义 | 并发/失败/预算测试 | 模型价格来源或模拟声明 | 本地公式/并发/预算已修；持久化待补 |
| P0-08 | Zod | 可编译代码块、bundle script | fence compile、bundle regression | esbuild metafile/raw outputs | 代码/脚本已修；性能 benchmark 待补 |
| P1-01 | 测试证据 | `verify:experiments`、独立 configs | 全实验入口 | 按篇 evidence snapshot | 根入口与本批快照已补；全库仍待补 |
| P1-02 | 生产边界 | DB/观测/安全/生命周期 | 故障与恢复矩阵 | staging/production 运行记录 | 已明确降级为本地原型；生产证据未完成 |
| P2-01 | 编辑质量 | 按文型重组 | 逐篇终审 | 一手引用闭合 | 受影响文章已重构；全库终审待补 |

任何条目标成“完成”时，应在本表把“当前状态”改成日期 + commit/evidence 路径，而不是只写“已修”。

## 十七、本次验证记录

### 17.1 站点级验证

在本次审计期间，根目录验证结果为：

- `npm test`：11 个 test files、41 个 tests 通过；
- `npm run lint`：0 error，1 个既有 warning，位于 `components/post/mermaid-renderer.tsx` 的 `<img>`；
- `npm run build`：成功静态生成 254 个页面，其中包含 100 个文章页。

这些结果证明当前博客站点可以测试、lint 和静态构建；它们不覆盖根 `tsconfig`/ESLint 明确排除的 experiments。

### 17.2 service 修复前基线（保留原始反例）

| 命令/环境 | 结果 |
| --- | --- |
| 默认 Node v18.13.0：`npm test` | Vitest 启动失败，缺 `node:util.styleText` export |
| Node v24.19.0：`npm test -- --coverage` | 3 files、11 tests 通过；71.91% statements、60% branches、77.21% lines |
| `npx tsc --showConfig` | 读取博客根 tsconfig；files 不含 service，exclude 包含 experiments |
| `npm run build --if-present` | 成功跳过；没有 `dist/` |
| 10 个 GET 404 | `not_found=10`，latency `n=0` |
| 2 个并发同 key POST | 两个 201、两个不同 orderId |
| Node v24 启动 `src/app-buggy.ts` | import error：当前 store 不导出 `InMemoryOrderStore` |

## 十八、一手资料索引

- [Go FAQ：goroutines 与线程](https://go.dev/doc/faq#goroutines)
- [Effective Go：Concurrency](https://go.dev/doc/effective_go#concurrency)
- [Go Language Specification：Channel types](https://go.dev/ref/spec#Channel_types)
- [Node.js：Timers](https://nodejs.org/api/timers.html)
- [Node.js：Streams](https://nodejs.org/api/stream.html)
- [GitHub Docs：Workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows)
- [Google SRE：Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Zod：API documentation](https://zod.dev/api)

这些链接用于约束运行时和平台语义；本机数字仍必须由仓库里的可重复实验提供，官方文档不能替代本机实验，本机实验也不能替代规范或生产证据。

## 十九、2026-08-16 修复登记：保留反例，登记可复核边界

本节是对上面原始问题索引和验收矩阵的增量记录。原始反例、旧数字和“未完成”分析不删除；本节只登记本次实际改动和证据路径。当前工作区仍是 dirty checkout，登记基于 `HEAD=9dde22f` 加上本次未提交改动。

### 19.1 已落地的本地修复

| ID | 本次改动 | 本机证据 | 仍不能证明 |
| --- | --- | --- | --- |
| P0-01 | middleware 用 `try/finally` 覆盖 2xx/404/400/409/500；延迟按 operation/outcome 分桶；`/healthz` 与 `/readyz` 分开 | `evidence/service-observability-slo/2026-08-16-local/`；3 个 service test files、18 个 tests | 真实端口 p99、数据库延迟、30 天 SLI/SLO |
| P0-02 | 单进程 `saveByKey` 把 claim 与写入放在同一同步段；保存 request fingerprint；同 key 并发只返回一个 canonical order；不同 body 返回 409 | `evidence/service-testing-strategy/2026-08-16-local/`；并发测试与 coverage raw | PostgreSQL 唯一约束、重启恢复、多实例竞争、响应丢失后的未知结果 |
| P0-03 | workflow 移到根 `.github/workflows/service-ci.yml`；Node 20/22/24 矩阵；typecheck/test/build 与非空 artifact 校验；增加 service `tsconfig`/build 脚本 | 根 workflow 与 `npm run verify:experiments` 本地通过 | GitHub Actions run、artifact 下载、staging/deploy/rollback |
| P0-04 | 不伪造历史事故；新增明确标注的 bounded/unbounded 构造演练和可运行基线 | `evidence/service-incident-drama/2026-08-16-local/`：500 条输入、两表 500/100 | 历史 RSS/heap/wrk 原始输出、对应 commit、真实事故时间线 |
| P0-05 | 修正 goroutine 与 OS thread 的层级表述；分离 `time.Sleep`、主线程 busy loop、timer 顺序；加入 Node/Go 最小实验 | `evidence/typescript-event-loop-vs-gmp/2026-08-16-local/` | 同语义 CPU 多轮分布、worker_threads 对照、生产尾延迟 |
| P0-06 | 数组/generator/Readable 改成独立进程；区分运行期峰值与 GC 后快照；记录 HWM 和 producer-consumer lag；修正 Go channel 语义 | `evidence/typescript-streams-backpressure/2026-08-16-local/`：5 份 raw JSON | socket/Writable/drain/慢消费者完整链路、跨版本稳定性 |
| P0-07 | Promise 占位先入表；失败删除允许显式重试；成本公式补 `/1000`，用微美元整数和预算拒绝 | `evidence/typescript-agent-production/2026-08-16-local/`：4 个 Node tests、demo raw | 持久化幂等、跨进程租约、真实供应商账单与配额 |
| P0-08 | Zod 示例补 type-only `z.infer` 导入；独立 `tsc` 和 esbuild size script；移除未经 benchmark 的性能倍数，并修正 demo 的 manifest/bundle 混淆 | `evidence/typescript-interface-schema-zod/2026-08-16-local/`：typecheck、main raw、bundle TSV | 不同 bundler/target 的普遍体积结论、吞吐/延迟 benchmark |

### 19.2 当前验证命令

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| 站点 | `npm test` | 11 个 test files、41 个 tests 通过 |
| 站点 | `npm run lint` | 0 error；保留 1 个既有 `<img>` warning |
| 站点 | `npm run build` | 静态构建成功，生成 254 个页面 |
| 实验 | `npm run verify:experiments` | service typecheck/test/build、Agent tests、Zod typecheck/bundle、streams smoke、event-loop smoke、Go smoke 全部通过 |
| service | Node 24.19.0 coverage | 3 个 files、18 个 tests；80% statements、71.62% branches、81.48% lines |

`verify:experiments` 是当前批次的最小入口，不等于全库所有 `experiments/` 已纳入 CI；根站点验证也不等于真实数据库、GitHub Actions、staging 或 production 验证。

### 19.3 质量闸门状态

本次清掉的是可由当前 checkout 直接修复的 P0 代码/事实冲突，并把无法取得的历史与平台证据显式降级。P0-04 的历史事故证据、P0-02 的持久化幂等、P0-03 的真实 Actions/deploy、P0-01 的真实 SLI/SLO 和 P1-02 的生产边界仍未清零；因此当前不能把“把原理变成服务”称为生产闭环，也不能把这些本地 evidence snapshot 称为线上证据。

## 二十、2026-08-16 继续修订：把低证据密度文章绑定到确定性工件

本节继续保留上面的 P0/P1 原始反例，只登记本轮为内容深度和复现闭环新增的工件。当前仍是 dirty checkout，基准为 `HEAD=9dde22f`。

### 20.1 Go 运行时微基准批次

新增统一入口 `experiments/go-runtime-boundary/`，覆盖 append、atomic/Mutex/自旋锁、channel、sync.Map、闭包逃逸、defer/panic、错误链、interface 装箱、sync.Pool、map/slice 查找、timer 与 string/[]byte；文章中的精确数字均回指 `evidence/go-runtime-boundary/2026-08-16-local/`，并在正文标出 CPU、Go 版本、输入形状和单机限制。

本轮另外补齐三篇此前证据不足的文章：

| 文章 | 本轮修订 | 证据路径 |
| --- | --- | --- |
| `go-slice-subslice-hold` | 把不可复现的 1GB/1001MB 叙述改成 65536×1KiB、三次独立进程运行；同时解释 `len/cap`、`HeapAlloc` 与累计分配的差别 | `experiments/go-runtime-boundary/cmd/slice-retention`；`evidence/go-slice-subslice-hold/2026-08-16-local/` |
| `go-gc-gctrace-account` | 用真实 Go 1.25.1 三段 gctrace 格式替换旧四段样张；记录 GOGC 50/100/200 的同输入观测，并补 GOMEMLIMIT 边界 | `experiments/go-runtime-boundary/cmd/gc-trace`；`evidence/go-gc-gctrace-account/2026-08-16-local/` |
| `go-map-hmap-cost` | 修正 25.7%/37.6% 的插入数字及标题，保留 key 形状与字符串基准限制 | `evidence/go-runtime-boundary/2026-08-16-local/raw/errors-interface-pool-map.txt` |
| `go-channel-hchan-cost` | 将旧的 send/recv、ping-pong 和 Mutex 混合表改为同一条阻塞 send 的容量对照；补并发 sender 反例与 send-only 边界 | `experiments/go-runtime-boundary/bench_test.go`；`evidence/go-runtime-boundary/2026-08-16-local/raw/channel-syncmap-time-string.txt` |
| `go-sync-map-boundary` | 用稳定 key 并发读与已有 key 并发写的同语义对照替换旧数字；补 miss、Range 快照和官方专用场景 | `experiments/go-runtime-boundary/bench_test.go`；`evidence/go-runtime-boundary/2026-08-16-local/raw/channel-syncmap-time-string.txt` |
| `go-timeafter-hidden-cost` | 绑定 `time.After`、每轮 `NewTimer`+`Stop` 与循环外 `Reset` 三档；补 Go 1.23 timer channel 合同 | `experiments/go-runtime-boundary/bench_test.go`；`evidence/go-runtime-boundary/2026-08-16-local/raw/channel-syncmap-time-string.txt` |
| `go-string-byte-conversion` | 更新 32B/8KiB 转换、map 临时转换、unsafe 与 Builder 数字；删除不存在的旧逃逸样例 | `experiments/go-runtime-boundary/bench_test.go`；`evidence/go-runtime-boundary/2026-08-16-local/raw/channel-syncmap-time-string.txt` |
| `go-select-selectgo-cost` | 用 1/2/4/8 case 的非阻塞扫描和 100 万次双 ready smoke 替换无 raw 的 5 亿次/阻塞混合数字；保留阻塞路径未测边界 | `experiments/go-runtime-boundary/bench_test.go`、`cmd/select-fairness`；`evidence/go-select-selectgo-cost/2026-08-16-local/` |
| `go-lock-cost-futex-rwlock` | 用统一 atomic/Mutex/spin 争用矩阵替换旧的 14/118/106ns 混合数字；保留 Linux futex 为机制来源，不冒充 Darwin 运行证据 | `experiments/go-runtime-boundary/bench_test.go`；`evidence/go-runtime-boundary/2026-08-16-local/raw/contention.txt` |
| `go-goroutine-stack-growth` | 新增 fresh-goroutine 递归 probe 与生命周期 benchmark；删除未经当前 raw 支持的 391/8.2ns/128MB 固定说法，改为函数帧相关的条件性机制解释，并保留“不能与 send-only channel/Mutex 争用跨篇比价”的原始反例 | `experiments/go-runtime-boundary/cmd/stack-growth`、`BenchmarkGoroutineCreateJoin`；`evidence/go-goroutine-stack-growth/2026-08-16-local/` |

### 20.2 低字数文章的针对性重构

这轮没有批量复制“结论 + 下一步”模板，而是按文章的问题形状增加不同证据：

- `consistent-hashing-minimal-remap` 使用 100000 个确定性 key，实测 3→4 环搬动 14.553%、取模搬动 74.828%，并显式区分平均期望与单次环位置；证据在 `evidence/consistent-hashing-minimal-remap/2026-08-16-local/`。
- `tree-shaking-comparison-costs` 使用锁定 esbuild 0.28.0 的合成 CJS/ESM 入口，实测 964B 对 56B；删掉 lodash 的未经绑定倍数，并把 CJS、sideEffects、动态 import 的失效方式分开；证据在 `evidence/tree-shaking-comparison-costs/2026-08-16-local/`。
- `deployment-canary-blue-green` 增加错误预算近似公式、最小样本、缺失指标的 hold 语义、schema 兼容和回滚动作；不再把 1–5% 或秒级回滚写成普遍合同。
- `service-release-checklist` 增加 source/build/deploy/runtime/recovery 五道闸门、artifact digest、迁移兼容和回滚时序；`service-api-shape`、`service-testing-strategy`、`service-design-adr` 增加分别对应幂等响应、测试边界和决策证据流的 Mermaid 图。
- `typescript-agent-production` 增加并发合并、幂等重放、预算扣款的语义矩阵与 Mermaid；保留单进程 Map、外部副作用未知结果和预算并发扣款未实现的边界。
- `go-benchmark-pitfalls` 与 `go-goroutine-stack-growth` 清理旧的 304/247/106/105.6/118 等跨文章数字，改成按操作、输入、`-cpu`、Go 版本和 raw 路径闭合证据；没有为未测的 ping-pong 路径补造数字。
- `go-timeafter-hidden-cost` 补充示例 `5s` 与 benchmark `time.Hour` 的输入差异；`go-string-byte-conversion` 补充 64 位 arm64 header 前提和 `order.go` 路径；`go-sync-map-boundary` 收窄 dirty 表首次写入的表述；锁篇明确最小代码片段不是完整基准。

### 20.3 当前验证

本轮新增或重跑：

| 命令 | 结果 |
| --- | --- |
| `npm run audit:content` | 100 篇，`Issues: {}` |
| `npm run verify:experiments` | service、TS、Go、Python、Tree Shaking smoke 全部通过；Go gate 已覆盖文章引用的 goroutine 生命周期、并发 atomic/Mutex/spin、channel、select、sync.Map、timer 与 string 基准，fairness 使用 100 万次输入，stack-growth 使用 3 个深度 smoke |
| `go test ./go-runtime-boundary -run '^TestSubsliceRetainsBackingArray$'` | 通过 |
| `go test ./go-runtime-boundary ... -benchmem` | 通过；当前数值仍绑定本机和运行参数 |
| `go test ./go-runtime-boundary -run '^$' -bench '^(BenchmarkChannelSend|BenchmarkSyncMapReadParallel|BenchmarkSyncMapWriteParallel|BenchmarkTimeAfterHour|BenchmarkNewTimerReset|BenchmarkStringFromBytes32|BenchmarkMapLookupStringBytes|BenchmarkStringBuilderLoop)$' -benchmem -benchtime=200ms -cpu=8` | 通过；选定子基准输出与文章实验入口一致，ns/op 随短 benchtime 波动，B/op/allocs/op 与 raw 口径一致 |
| `npm test` | 11 个 test files、41 个 tests 通过；并行构建时曾出现一次 5 秒超时，单独重跑通过 |
| `npm run lint` | 0 error；保留 `components/post/mermaid-renderer.tsx` 的既有 `<img>` warning |
| `npm run build` | 254 个静态页面生成成功 |
| `git diff --check` | 通过 |

这些证据提升了文章与当前工件的一致性，但没有改变第十九节的质量闸门：真实 PostgreSQL、多实例、Actions run、staging/deploy、生产 SLI/SLO 和历史事故 raw 仍未取得。因此 P0/P1 不得在验收矩阵中标成“完全完成”。

## 二十一、2026-08-17 继续修订：把新增 LLM/存储草稿也纳入证据闸门

本节是 2026-08-17 继续工作后的增量记录。第 20.3 节的 100 篇是上一快照，不覆盖随后加入工作区的文章；本节只登记新增修复与当前验证结果，不删除前面的原始反例。

### 21.1 新增文章与实验闭环

| 文章/主题 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `llm-embedding-retrieval` | 增加规范参考资料；用 bundled Python/NumPy 运行固定 seed 的高维余弦、归一化排序和分块模拟；修正 NumPy 版本 | `evidence/llm-embedding-retrieval/2026-08-16-local/`；只证明合成向量，不证明真实 embedding 模型或向量库召回 |
| `llm-sampling-reproducibility` | 增加官方参考资料；修正 NumPy 版本；保存 temperature/top-p/seed/T=0 模拟输出 | `evidence/llm-sampling-reproducibility/2026-08-16-local/`；不证明供应商 API 跨硬件、跨版本的确定性 |
| `llm-token-economics` | 修正缓存输入的成本公式、总量/未缓存/缓存列和当前官方价格快照；补 tokenizer/cost raw | `evidence/llm-token-economics/2026-08-16-local/`；价格随供应商调整，真实账单和配额仍未取得 |
| `llm-tool-calling-contract` | 增加 RFC 9457/9110 与本机模拟证据；明确 0%/100% 只属于确定性启发式，不外推真实模型成功率 | `evidence/llm-tool-calling-contract/2026-08-16-local/` |
| `llm-as-judge-evals` | 补 MT-Bench 与 Anthropic 官方定价引用；把不存在/未核实的 Sonnet 5 改为 Sonnet 4.6；明确 stub 与真实 judge 的证据边界 | `evidence/llm-as-judge-evals/2026-08-16-local/`；真实模型偏差率、人工校准和云账单未验证，文章保持 draft |
| `llm-continuous-batching-throughput` | 运行同一固定 trace 的 static/continuous 模拟；纠正脚本输出列，把 `wall_s` 与 `req/s` 分开；补 2/8/32 req/s 表格 | `evidence/llm-continuous-batching-throughput/2026-08-16-local/`；是标准库离散事件模型，不是 GPU/vLLM benchmark |
| `mini-lsm-write-amplification` | 用固定输入 sweep 填写 T=2..60 的两种策略表，并保存 CSV；保留内存模型与真实磁盘的边界 | `evidence/mini-lsm-write-amplification/2026-08-16-local/`；不证明 RocksDB/LevelDB 的物理延迟或生产 compaction |
| `go-netpoll-wakeup-scheduling` | 保存 Darwin socket/raw syscall 的线程与唤醒 raw；正文改为 n=1000 的实际快照，不把 macOS plateau 外推成 Linux epoll 结论 | `evidence/go-netpoll-wakeup-scheduling/2026-08-16-local/`；Linux、真实网卡和多轮尾延迟仍未验证 |

### 21.2 草稿与占位质量

- 统一清除了文章正文中的 `本机实测待补`、`待回填`、`数字待回填` 和 `待补 evidence`。缺少真实依赖的文章现在直接说明“当前未取得运行快照”并继续保持 `draft: true`，不会用空表或占位数字伪装成终稿。
- `scripts/content-quality-audit.mjs` 已把上述中文占位标记纳入 `placeholder` 规则；结构审计仍覆盖 frontmatter、TL;DR、参考资料、弱标题、重复编号和内部链接。
- 草稿单独以 `readPostSources(directory, "development")` 加 `compileMarkdown` 验证，当前 21 篇草稿均产生非空 HTML 与 TOC；临时验证文件已删除。

### 21.3 当前验证快照

| 范围 | 命令/事实 | 结果 |
| --- | --- | --- |
| 内容结构 | `npm run audit:content` | 124 篇源文件（103 发布态、21 草稿），`Issues: {}` |
| 实验闸门 | `npm run verify:experiments` | 通过；新增覆盖 tool-calling、LLM judge stub、continuous batching、mini-LSM sweep、Go netpoll benchmark；既有 service/TS/Go gate 仍通过 |
| 站点内容合同 | `npm test -- --run` | 11 个 test files、41 个 tests 通过；`tests/content.test.ts` 已纳入 `llm-tool-calling-contract` |

当前仍不能把这些本地证据写成生产闭环：真实 PostgreSQL/多实例幂等、真实 Redis/Kafka/MySQL/Kubernetes 运行、GitHub Actions/deploy/staging、生产 SLI/SLO、真实供应商账单/GPU benchmark 和历史事故 raw 仍缺。它们继续按第 16 节验收矩阵保持未完成状态。
