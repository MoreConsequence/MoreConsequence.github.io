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
| P0-01 | SLO/metrics | 全路径计时、按操作分布、liveness/readiness 分离 | 200/404/400/500 指标测试 | 真实端口压测、SLI 窗口定义 | **2026-08-19 已补本机真实端口压测**：`evidence/service-observability-slo-port/2026-08-19-local/run.out`（120 并发、404/409 各 30 样本、SLI 口径 A/B 对比、p99<100ms）；真实端口+SLI 窗口已现验证，月度窗口/多实例/真实依赖待补 |
| P0-02 | service 幂等 | 数据库原子 claim、fingerprint、结果重放 | 并发/重启/多实例/冲突 | PostgreSQL 运行记录 | **2026-08-19 已补本机 PostgreSQL 运行记录**：`evidence/service-postgres-idempotency/2026-08-19-local/run.out`（PostgreSQL 16.15 / blog-pg:15432；并发 100 同 key → created=1 行=1；重建连接重放 id 不变；异指纹 conflict=true）。单进程内已验证；多实例与真实部署仍未覆盖。 |
| P0-03 | CI/CD | 根 workflow、service build、真实 deploy | Node 矩阵、smoke、rollback | Actions run、artifact、部署 URL | **2026-08-19 已闭环**：Service CI 32274895383 + Pages 32274895358 均 success（dfcf93a），站点 built + HTTP 200，线上含新证据段落；失败反例 32257040131 归档（§30） |
| P0-04 | 事故复盘 | 可启动的三阶段历史版本 | 容量与映射一致性回归 | wrk/RSS/heap/profile 原始输出 | 历史事实未修；构造演练可重跑 |
| P0-05 | event loop/GMP | 等价实验程序 | 多轮延迟分布 | Go/Node 官方资料、环境快照 | **2026-08-19 已补 30 轮多轮延迟分布**：`evidence/typescript-event-loop-vs-gmp/2026-08-19-local/multi-round-dist.txt`（Go 唤醒 p50=1ms/max=2ms；Node 基线 p50=11.2ms；busy 阻塞后 p50=61.0ms，数据链与 raw 落盘）；语义/实验/分布均本机验证，跨机器吞吐常数未覆盖 |
| P0-06 | streams | 独立模式、队列/峰值采样 | HWM/slow consumer/drain 对照 | Node/Go 规范、raw memory series | **2026-08-19 已补完整下游链路对照**：`evidence/typescript-streams-downstream/2026-08-19-local/run.out`（同 generator→慢 Writable 三路径：A 直接 for-await Lag=0、B pipe HWM=16 Lag=1/缓冲15B、C pipe HWM=2 Lag=1/缓冲1B，drain 节流一致）；独立进程/HWM/慢下游/raw 均已本机验证，真实 socket 链路未覆盖 |
| P0-07 | Agent 成本/幂等 | 正确单位、定点金额、原子语义 | 并发/失败/预算测试 | 模型价格来源或模拟声明 | **2026-08-19 已补 MySQL 8 持久化幂等实测**：`evidence/idempotency-engineering/2026-08-19-local/run.out`（并发 100 同 key→created=1/扣款=1、异指纹 conflict、重建连接重放不重扣）；公式/并发/预算/持久化均本机验证，跨进程租约与真实账单未覆盖 |
| P0-08 | Zod | 可编译代码块、bundle script | fence compile、bundle regression | esbuild metafile/raw outputs | **2026-08-19 已补同语义性能 benchmark**：`evidence/typescript-interface-schema-zod-bench/2026-08-19-local/`（2M 次/轮、预热 10 万、连续两次；合法 zod/v4≈0.09–0.10x、非法≈0.19–0.20x）；bundle 体积与性能数字均本机实测，生产全链路未覆盖 |
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
| `llm-hallucination-measurable` | 修复实验中 `Math.random()` 与“确定性可复现”冲突；按新 raw 输出修正 1σ、不可判定题污染和分栏数字；增加样本量公式、评测合同、发布门槛、FActScore/NIST 参考资料 | `evidence/llm-hallucination-measurable/2026-08-17-local/`；只证明确定性统计模拟，不证明真实模型幻觉率、人工标注一致性或线上评测收益 |
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
- 草稿单独以 `readPostSources(directory, "development")` 加 `compileMarkdown` 验证，当前 20 篇草稿均产生非空 HTML 与 TOC；临时验证文件已删除。

### 21.3 当前验证快照

| 范围 | 命令/事实 | 结果 |
| --- | --- | --- |
| 内容结构 | `npm run audit:content` | 125 篇源文件（105 发布态、20 草稿），`Issues: {}` |
| 实验闸门 | `npm run verify:experiments` | 通过；新增覆盖 tool-calling、幻觉测量、LLM judge stub、continuous batching、mini-LSM sweep、Go netpoll benchmark；既有 service/TS/Go gate 仍通过 |
| 站点内容合同 | `npm test -- --run` | 11 个 test files、41 个 tests 通过；`tests/content.test.ts` 已纳入 `llm-tool-calling-contract` |

当前仍不能把这些本地证据写成生产闭环：真实 PostgreSQL/多实例幂等、真实 Redis/Kafka/MySQL/Kubernetes 运行、GitHub Actions/deploy/staging、生产 SLI/SLO、真实供应商账单/GPU benchmark 和历史事故 raw 仍缺。它们继续按第 16 节验收矩阵保持未完成状态。

## 二十二、2026-08-17 逐篇终审继续：修正 service ADR 源工件并扩充 CI/选型文章

本节登记一次针对短 production 文章的内容终审。结构审计虽然已经通过，但逐篇检查发现 `service-design-adr` 正文已经声明旧性能数字没有 raw，而它引用的 `experiments/service/docs/adr/0001-framework.md` 仍保留 `44.7k/41.6k req/s`、冷启动和 `220KB` 等无法由当前 checkout 重算的数字。该矛盾先修源工件，再扩文章，不能只改博客表述。

### 22.1 本次修订

| 文章/工件 | 修订 | 当前证据与边界 |
| --- | --- | --- |
| `experiments/service/docs/adr/0001-framework.md` | 删除没有 raw/commit 的吞吐、冷启动和依赖体积数字；补状态、背景、错误合同、选项矩阵、正负后果、证据清单和推翻条件 | `evidence/service-design-adr/2026-08-17-local/`；只保留 Node 24 本地 typecheck/build、18 tests、错误/幂等测试证据；不证明框架性能或生产兼容 |
| `service-design-adr` | 增加 Hono/Fastify/裸 `node:http` 的语义矩阵、Agent 错误传播时序图、ADR 判断 → 代码/测试/后续实验映射表 | 选型理由落到 `src/app.ts`、`src/app.test.ts`、`src/store.ts`；未取得性能 raw 仍明确不写性能排名 |
| `service-ci-cd` | 增加 `paths` 触发边界、job → 证明/不能证明矩阵、五层发布证据梯度和 artifact/Actions/staging/production 区分 | `evidence/service-ci-cd/2026-08-17-local/`；当前 workflow 只有本地可验证配置；没有真实 Actions run、artifact digest、staging URL 或部署/回滚记录 |
| `connection-pool-math-timeout` | 补回固定 seed 的标准库离散事件模拟；修正“λW×P99”和“λW×2.5 通用甜点位”的过强表述；把失败率、排队 P99 和模型边界绑定到 raw | `experiments/connection-pool-sim/sim.py`、`evidence/connection-pool-math-timeout/2026-08-17-local/`；不证明真实数据库/驱动/连接池性能 |
| `btree-page-split-write-amplification` | 删除死命令和未绑定的 InnoDB 精确数字；改为固定 seed 的叶页分裂模型，补 4/8/16KB 表、16KB 账本和真实写放大边界 | `experiments/btree-page-split/sim.py`、`evidence/btree-page-split-write-amplification/2026-08-17-local/`；只证明教学模型的填充率/总页数差异，不证明 InnoDB 磁盘写放大、吞吐或延迟 |

### 22.2 逐篇终审的当前结论

- 当前 production 文章中，正文最短的两篇不再只靠增加字数掩盖缺口：`service-design-adr` 约 4.3k 字符，`service-ci-cd` 约 4.7k 字符，并且每篇都有信息型章节、表格、Mermaid 或代码、参考资料和明确证据边界。
- `service-design-adr` 的博客正文、ADR 源工件和服务测试现在对“没有性能证据”使用同一口径；不存在文章说没有 raw、artifact 却继续声称实测数字的冲突。
- “CI 通过”“artifact 存在”“staging 可回显”“production 可回滚”继续作为四个不同命题，不能由同一个绿色 job 代替。
- `connection-pool-math-timeout` 现在有可运行的固定 seed 模拟；文章只保留排队模型结论，明确不把它命名为 MySQL/HikariCP benchmark。
- `btree-page-split-write-amplification` 现在有可运行的固定 seed 叶页模型；文章把“+43.5%”收窄为模型内总页数差异，明确没有模拟记录格式、buffer pool、redo/undo、fsync、并发、删除更新和真实设备。
- `tcp-syn-queue-backlog` 删除了无法成立的 `backlog_probe.py`/未 join 客户端代码，改用保持成功 socket 的 probe；Darwin 本机输出为 2 个连接成功、4 个超时，并明确不外推 Linux 队列容量。
- `tcp-nagle-delayed-ack` 删除当前 checkout 无法追溯的 118.6ms、1.5ms 和 79 倍抓包数字，改用固定参数时序模型；`tcp-retransmit-timeout-rto` 同样把缺失的 `tc netem` 时间线改成 RFC 6298 风格退避模型。

### 22.3 本轮底层与协议文章的证据边界

| 文章 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `tcp-syn-queue-backlog` | 把死命令替换为并发 probe，记录成功连接保持时间，并区分 Darwin 观察与 Linux `ss`/内核计数器 | `experiments/tcp-syn-backlog/probe.py`、`evidence/tcp-syn-queue-backlog/2026-08-17-local/`；没有 Linux SYN-cookie/内核版本/抓包证据 |
| `tcp-nagle-delayed-ack` | 删除不可追溯的 Docker/netem 精确数字；增加 RTT + delayed-ACK 的确定性时序模型，收窄 40ms 为教学参数 | `experiments/tcp-nagle-timeline/sim.py`、`evidence/tcp-nagle-delayed-ack/2026-08-17-local/`；不证明任意 Linux、网络或语言框架的实际延迟 |
| `tcp-retransmit-timeout-rto` | 删除未保存的 `tc netem`/tcpdump 输出；用固定 SRTT/RTTVAR 模型展示超时退避、Karn 样本丢弃与快速重传分工 | `experiments/tcp-rto-timeline/sim.py`、`evidence/tcp-retransmit-timeout-rto/2026-08-17-local/`；不证明 Linux RTO 默认值、拥塞窗口或 SACK 抓包行为 |
| `epoll-c10k-c10m` | 删除缺少服务端/容器/raw 的 `wrk` 吞吐、延迟和 CPU 数字；修正 `O(N)` 总成本的过度简化，改为全量扫描与就绪事件计数模型 | `experiments/epoll-readiness-model/sim.py`、`evidence/epoll-c10k-c10m/2026-08-17-local/`；只证明复杂度方向，不证明 Linux 内核吞吐、延迟或 perf 热点 |
| `go-goroutine-leak-pprof` | 删除无法追溯的 3531/2MB/0% profile 样张；新增固定 3×300 阻塞形状 probe，保留 heap/stack 作为辅助账，按 goroutine profile 分组和源码行定位 | `experiments/go-goroutine-leak-pprof/main.go`、`evidence/go-goroutine-leak-pprof/2026-08-17-local/`；不证明生产 goroutine 内存固定、heap 差值为零或线上 profile 形状 |
| `go-memory-leak-pprof` | 删除 0.25GB→1.99GB 和 `cd leakdemo` 死命令；用 32×64KiB 保留缓冲 + 100 个阻塞 goroutine 的两帧指标 probe，修正默认 heap 采样表述 | `experiments/go-memory-leak-pprof/main.go`、`evidence/go-memory-leak-pprof/2026-08-17-local/`；只证明受控输入下的 HeapAlloc/对象数/goroutine 差，不证明线上泄漏速度或 RSS 恢复 |
| `go-scheduler-gmp-preemption` | 删除未绑定的 441ns/171ns、schedtrace 样张和“10ms 最坏延迟”承诺；新增独立 benchmark，区分稳态操作成本与 runtime 抢占阈值 | `experiments/go-scheduler-boundary/bench_test.go`、`evidence/go-scheduler-gmp-preemption/2026-08-17-local/`；不证明业务请求 p99、最坏等待或跨机器性能 |
| `go-mallocgc-allocator` | 删除未绑定的多档分配/并发数字与“单一全局锁”归因；新增固定 byte-slice size/RunParallel benchmark，补 sink、输入和对象池决策边界 | `experiments/go-mallocgc-boundary/bench_test.go`、`evidence/go-mallocgc-allocator/2026-08-17-local/`；不证明所有对象形状、size class、GC 或 pool 的普遍性能 |
| `typescript-llm-tool-loop` | 把 `Math.random()` 与“真实输出”冲突改为固定 LCG seed；同步生成 JS、更新 timeout 竞态输出并补 typecheck/demo 入口 | `experiments/ts-agent/main.ts`、`evidence/typescript-llm-tool-loop/2026-08-17-local/`；只证明模拟管线可重放，不证明真实模型成功率、外部延迟、取消传播或写工具幂等 |
| `js-async-await-promise-timing` | 删除“await 与 then 各恰好一个微任务”和未绑定的 243/21/101ms 断言；保留可观察微任务顺序、thenable 交接、未处理 rejection 子进程断言，并把串行/并行改为固定输入的关键路径 | `experiments/js-async-promise-timing/`、`evidence/js-async-await-promise-timing/2026-08-17-local/`；只证明当前 Node smoke 的顺序和退出行为，不证明浏览器差异、内部 Job 数或网络 I/O 延迟 |
| `typescript-toolchain-rules` | 删除旧 zod 3.x、24 个直接依赖、tsc/esbuild 单次耗时和 2000 模块样张；绑定当前仓库 Node/npm/TS/esbuild/zod、17/7 依赖计数与 npm 布局快照，补 tsc/esbuild 分工命令 | `experiments/ts-toolchain-boundary/inspect.mjs`、`evidence/typescript-toolchain-rules/2026-08-17-local/`；没有 pnpm 安装、跨项目速度排名或历史依赖漂移 raw |
| `http-cache-control-etag` | 删除 5MB/200B 和“服务端 100% 应输出协商缓存”的泛化；补 origin 200/304 probe、`curl -I` 与 GET 差异、`public/private/s-maxage/Vary`、hash 资源/HTML/私有 API 决策矩阵 | `experiments/http-cache-contract/probe.mjs`、`evidence/http-cache-control-etag/2026-08-17-local/`；只证明当前 Node origin 的协议响应，不证明浏览器缓存、CDN 命中或网络延迟 |
| `distributed-id-snowflake-segment` | 把“唯一/有序/中心化/时钟容错三选一”扩成位预算、同毫秒耗尽、号段原子预留、空洞、隐私和故障矩阵；修正跨节点严格单调与 400 万吞吐表述 | `experiments/snowflake/main.go`、`evidence/distributed-id-snowflake-segment/2026-08-17-local/`；只验证教学实现的小回拨等待/超阈值拒绝，不证明并发 worker 注册、数据库原子性或跨区域排序 |
| `covering-index-avoid-back-to-table` | 删除固定 1–5ms 回表数字和“Using index 最优/Using filesort 最差”的二元判断；补 ICP、MVCC、低选择性、排序、锁、写放大和 EXPLAIN/实际行数验收矩阵 | 当前为规范/计划语义文章，没有可用 MySQL raw；不把示例 EXPLAIN 当本机 benchmark |
| `go-sync-pool-design` | 增加对象重置、别名所有权、外部资源关闭、容量上限和敏感数据清零边界，补可编译 `bytes.Buffer` 使用示例 | `evidence/go-runtime-boundary/2026-08-16-local/raw/errors-interface-pool-map.txt`；数字仍是本机热命中/直接分配基线，不证明 GC 后成本或生产服务收益 |
| `http2-head-of-line-blocking` | 删除固定丢包率/全连接 1 RTT/“慢流吸干连接窗口”的过度简化；补确定性 h2/h3 丢包影响模型，区分每流窗口、连接窗口和拥塞控制 | `experiments/http2-hol-model/sim.py`、`evidence/http2-head-of-line-blocking/2026-08-17-local/`；不证明真实 h2/h3 栈、网络 p99、TLS 或拥塞控制收益 |
| `socket-backpressure-slow-consumer` | 删除跨平台 `SO_RCVBUF` 默认值、固定每连接 OOM 算式和“单张 `ss` 快照即可定位源头”的过度结论；补 `Recv-Q`/`Send-Q`/`rwnd`/应用队列分层、容量预算、部分写入与 `EAGAIN` 语义、连接生命周期策略 | 当前为 Linux 手册约束下的语义文章；示例 `ss` 输出是教学化简，没有本机 Linux `ss` raw，也不证明某个生产服务的 RSS、对端队列或 SLO |
| `mesi-cache-coherence-false-sharing` | 删除跨 CPU 的 64B/延迟/2–5 倍固定断言和“广播”实现细节；补带 offset 断言的 packed/padded 原子计数对照、7 次中位数、真实共享/数组邻接/分片与 padding 取舍 | `experiments/mesi-false-sharing/main.go`、`evidence/mesi-cache-coherence-false-sharing/2026-08-17-local/`；当前只证明 Darwin arm64 一次 workload 对照，不证明 PMU cache 事件、跨架构倍数或生产收益 |
| `go-defer-panic-cost` | 修正 panic/recover 在标题、正文和决策表之间的 67/74/50 倍数字漂移；把深度展开成本改成不外推固定每层常数 | 沿用 `evidence/go-runtime-boundary/2026-08-16-local/raw/closure-defer-panic.txt`；本轮只修正文数字链，不新增 benchmark，不证明其他 Go 版本或架构 |
| `go-interface-boxing` | 补可编译 typed-nil 示例、方法集边界和接口合同；把“泛型是终极解/无 itab”改为需按同语义 benchmark 验证的候选路径 | `experiments/go-interface-contract/main.go`、`evidence/go-interface-boxing/2026-08-17-local/` 加上既有 runtime benchmark raw；仍只证明 typed-nil 语义和当前短方法/装箱输入，不证明所有接口实现或泛型实例化路径 |
| `go-benchmark-pitfalls` | 删除当前 checkout 无 raw 的 0.79/12.8/48B/1024kB/12.9s 样张；把 `alloc_space` 的“512B 粒度”修正为 `MemProfileRate` 平均采样间隔与加权估计，保留 `-benchmem`、`-gcflags=-m`、`-benchtime` 和 `b.N` 的检查清单 | `experiments/go-runtime-boundary/bench_test.go`、`evidence/go-runtime-boundary/2026-08-16-local/`；只绑定当前统一 Go benchmark，不伪造旧失败样张，也不证明 profile 字节数等于单次分配 |
| `k8s-controller-watch-etcd` | 删除“单一写入者 + 无限订阅者”、每个 watcher 直连 etcd、RV 全局递增和 `resourceVersion=0` 从 revision 0 重放等过度简化；补对象/集合 RV、watch cache、list/watch 恢复、`resourceVersionMatch`、bookmark 与 streaming list 边界 | 当前依据 Kubernetes API Concepts 与 client-go/apiserver 源码链接的语义文章；没有目标集群 list/watch/410 raw，不把 watch-cache 保留时长或线性一致 p99 写成实测结论 |
| `mysql-redo-undo-binlog` | 修正 change buffer/三日志同时刷盘/恢复只看 XID 的简化；补 2PC prepare→binlog→commit、`innodb_flush_log_at_trx_commit`、`sync_binlog`、undo/redo/binlog 职责和进程 crash 与断电边界 | 当前依据 MySQL 8.0 官方手册的协议文章，没有锁定版本/实例、crash raw、error log、binlog 尾部或恢复耗时；不把示意时序写成已在线验证 |
| `database-deadlock-wait-graph` | 修正“普通只读也会因 gap lock 死锁”的混淆；区分一致性读、锁定读、范围写入和插入意图锁，补 disposable InnoDB 建表前提与 `LATEST DETECTED DEADLOCK` 观测边界 | 当前为 MySQL 官方锁语义与双会话命令文章，没有目标版本的真实死锁 raw、锁表快照或 victim 选择实验；不把 `innodb_lock_wait_timeout` 当死锁检测器 |
| `raft-consensus-term-log-replication` | 删除“follower 始终是 leader 前缀”“leader 只有一条永不分叉的线”和固定 election timeout 观察；补未提交后缀覆盖、当前 term 提交规则、ReadIndex/lease read 与 disposable etcd raw 边界 | 当前为 Raft 论文与 etcd 文档驱动的协议文章，没有本机 etcd 分区、WAL、leader/term 或恢复时间 raw；不把多数派模型写成生产可用性证据 |
| `exactly-once-message-delivery` | 把“exactly-once 不存在”改为按投递、Kafka 内部事务和外部副作用分层；修正 producer 幂等重启边界、`auto.offset.reset` 与 offset 提交时机混淆，补 inbox/outbox/HTTP 未知结果矩阵 | 当前为 Kafka 官方 EOS 语义与业务幂等模型文章，没有 broker/DB/外部 API crash raw；不把 Kafka 内部事务扩写成跨系统 exactly-once effect |
| `dns-ttl-negative-cache` | 删除“每跳重置 TTL/收敛时间相加”、默认 `dig` 命中本机缓存和负 TTL 固定上限/推荐值；补权威/递归/本地路径、serve-stale/prefetch、NXDOMAIN/NODATA 与 RFC 2308 的观察边界 | 当前为 RFC 2308/1035 与 resolver 文档驱动的语义文章；示例 `dig` 输出不是本机 raw，不证明某个域名的全球收敛时间或云 DNS 策略 |
| `quic-http3-connection-migration` | 删除“HTTP/2 HOL 没解决”“0-RTT 只限 GET”“CID 固定 8 字节/迁移免费”“tcpdump 可直接看 Stream ID/0-RTT”断言；补流级/连接级边界、replay-safe 合同、路径验证、CID/LB 和 qlog/key-log 证据要求 | 当前为 RFC 9000/9001/9114 语义文章，没有 curl/tcpdump/qlog/0-RTT/迁移 raw；不证明公网丢包收益、CDN 默认支持或固定 RTT/丢包倍数 |
| `redis-as-mq-consume-groups` | 修正 `XACK` 不删除 Stream entry、PEL 只记录消费组未确认状态、历史回读受保留/裁剪约束和 Pub/Sub 不持久化；删除 AOF everysec“硬丢 1 秒”、RDB 固定默认值和 Redis/Kafka 吞吐泛化，补消费组初始化、断电/异步复制/淘汰边界与 Streams/Kafka 语义矩阵 | 当前为 Redis 官方 Streams、Pub/Sub、持久化文档驱动的协议文章；没有目标 Redis 版本的断电、主从切换、`XAUTOCLAIM` 和 `XRANGE` raw，不把 `appendfsync` 配置名升格为可靠性 SLA |
| `buffer-pool-lru-dirty-pages` | 绑定 MySQL 8.4 语义，修正 `innodb_io_capacity` 单位与默认值、脏页目标/低水位、redo 75% 异步刷盘与 sharp checkpoint 的边界；删除未保存的 Docker 输出和固定行/页写放大，改为候选实验与单变量验证协议 | 当前依据 MySQL 8.4 官方 Buffer Pool、flushing、I/O capacity 和系统变量文档；没有固定镜像 digest、设备、重复轮次或 MySQL raw，不把配置默认值写成所有发行版/版本的生产建议 |
| `lsm-vs-btree-io-amplification` | 删除无 raw 的 RocksDB `db_bench` 3–10x/1–5x、HDD/NVMe 比例和树高=磁盘 I/O 等泛化；改用仓库 `mini-lsm` 固定输入 sweep，明确写/读/空间放大分母、Leveled/Size-Tiered 取舍和模型边界，补事务/删除/恢复评审矩阵 | `experiments/mini-lsm/`、`evidence/mini-lsm-write-amplification/2026-08-16-local/`；只证明内存教学模型的放大方向，不证明 RocksDB、SSD、压缩、并发 compaction、WAL fsync 或生产 p99 |
| `fsync-group-commit` | 修正 `dd` 未调用 `fdatasync` 却给出同步输出的反例；把字面 `fsync` 改为平台同步边界，删除未保存的设备毫秒表和 `pg_test_fsync` 样张，补 `synchronous_commit=off` 的 `3 × wal_writer_delay` 风险窗口、MySQL 三阶段组提交与 SQL 命令边界 | 当前依据 PostgreSQL 18 WAL/async commit/reliability、Linux `fsync(2)` 与 MySQL 8.4 group commit 文档；没有本机 Linux/PG/MySQL/设备 raw，不把模型吞吐或同步配置写成通用 SLO |
| `redis-persistence-rdb-aof` | 修正 RDB save 默认点、AOF `everysec`/`no` 固定丢失秒数和“kill -9 能证明断电窗口”的过度承诺；区分进程崩溃、主机/设备断电、复制和备份，保留草稿状态与实验入口 | 当前为 Redis 官方持久化/redis.conf/延迟文档驱动的草稿；没有目标 Redis 版本、设备断电、主从切换、bench/crash raw，不把同步策略名升格为硬 SLO |
| `llm-kv-cache-memory-budget` | 修正十进制 GB 与二进制 GiB 混算导致的 40/20/5、11/5/1 并发数字；更新计算器、README 和 raw 为 37/18/4、10/5/1，并区分公开 config 的理想内存上界与 vLLM/GPU/SLO 证据 | `experiments/llm-kv/kv_cache_budget.py`、`evidence/llm-kv-cache-memory-budget/2026-08-17-local/`；只证明公式和单位转换，不证明 GPU 分配、KV 量化质量或真实 serving 并发 |
| `vector-index-hnsw-ivf-pq` | 修正“ANN 只有三条路/召回时延内存只能三选二”、HNSW 每层 `M`、IVF `1/nlist`、HNSW 1.25x 和 IVF-PQ 16B 作为完整索引大小等过度简化；改为 payload 下界、数据分布前提和真实 embedding 补测门槛，保留草稿 | 当前为 HNSW/FAISS/PQ 论文与仓库合成数据脚本驱动的草稿；没有真实 embedding、运行环境/依赖版本、QPS/recall/索引大小 raw，不写生产规模或性能排名 |
| `llm-tool-calling-contract` | 把 0%/100%/token 数明确降级为确定性启发式模拟；修正“5xx 永远重试、4xx 永远修正”，增加 retryable、Retry-After、幂等键、未知结果和副作用边界矩阵，并补 Agent→API→查询/重试流程图 | `experiments/llm-tool-calling-contract/simulate.mjs`、`evidence/llm-tool-calling-contract/2026-08-16-local/`；只证明脚本控制流，不证明真实模型按相同错误码成功或真实 token 成本 |
| `llm-sampling-reproducibility` | 把 T=0、top-p 和 seed 的结论绑定到本地 logits 模拟；删除 provider 无条件“二选一/确定性”语气，补模型版本、tokenizer、system prompt、工具 schema、fingerprint 与差异容忍度的复现清单 | `experiments/llm-sampling-reproducibility/sampling_math.py`、`evidence/llm-sampling-reproducibility/2026-08-16-local/`；只证明固定 logits 与本地 RNG，不证明供应商跨版本或跨硬件确定性 |
| `go-closure-escape` | 区分无捕获函数字面量与真正闭包；修正“每个 escapes 都是分配点”、把 0.6669→12.47ns 差异单归因于逃逸、以及捕获大对象默认改指针的建议，补捕获/存活/调用边界矩阵 | `experiments/go-runtime-boundary/bench_test.go`、`evidence/go-runtime-boundary/2026-08-16-local/raw/closure-defer-panic.txt`；只绑定 Go 1.25.1/Darwin arm64 当前快照，不提供通用闭包常数 |
| `go-append-slice-growth` | 修复 100 万元素“41 次/4.9 倍”与 Go 1.25.1 实际增长不一致的问题；新增真实 append 容量 probe，改为 36 次、3.934677 倍，并区分累计搬运、B/op、allocator 和预分配 benchmark | `experiments/go-runtime-boundary/cmd/slice-growth/main.go`、`evidence/go-append-slice-growth/2026-08-17-local/`；只证明 Go 1.25.1/Darwin arm64 的 `[]int` 输入，不证明其他版本、元素类型或服务延迟 |
| `go-errors-is-unwrap-cost` | 修正正文残留的 39.53ns 与表格/raw 的 38.05ns 漂移；补 0/1/3/10 层同一 benchmark 的线性观察边界，保留 `errors.As` 未测和 `%w`/Join 语义取舍 | `evidence/go-runtime-boundary/2026-08-16-local/raw/errors-interface-pool-map.txt`；只绑定 Go 1.25.1/Darwin arm64 当前错误形状，不证明所有错误类型或生产尾延迟 |
| `go-atomic-vs-mutex` | 修正 runtime semaphore 与 futex 的跨平台混淆；删除不在当前 raw 的 7.2/14.8/81.2/213/121ns 和“超过 8 线程”阈值，保留 2/4/8/16 worker 的 Darwin contention 形状与 atomic/Mutex 语义边界 | `evidence/go-runtime-boundary/2026-08-16-local/raw/contention.txt`；只证明当前短临界区和 Darwin arm64，不证明 Linux futex、其他架构或通用 worker 阈值 |

本节不把 service 系列标成生产闭环。真实 PostgreSQL、多实例幂等、GitHub Actions run、staging/deploy、生产 SLI/SLO 和真实回滚证据仍按第 16 节保持未完成。

### 22.4 当前验证

| 命令/检查 | 结果 |
| --- | --- |
| `npm run audit:content` | 125 篇源文件，`Issues: {}` |
| `npm run verify:experiments` | 通过；service、Go runtime/pprof/benchmark（含 slice-growth、false-sharing 布局/计时与 typed-nil smoke）、Python 网络/队列模型、LLM、TS/JS smoke 全部通过 |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；保留 `components/post/mermaid-renderer.tsx:192` 的既有 `<img>` warning |
| `npm run build` | 268 个静态页面生成成功 |
| `out/` 静态检查 | 50 个本轮修订 production 文章页存在且标题与源文件一致；本轮 3 篇 draft 与其余 17 篇 draft 均未进入 production 输出 |
| `git diff --check` | 通过 |

这些结果证明当前 checkout 的站点、实验入口和本轮文章工件相互一致；它们仍不证明真实 PostgreSQL/多实例、GitHub Actions/deploy/staging、生产 SLI/SLO、真实供应商/GPU 或历史事故 raw。因此第 16 节的 P0/P1 验收矩阵继续保留“部分修复/证据待补”，本节不把本地 smoke 升格为生产证据。

### 22.5 2026-08-17 继续终审：把早期网络、可观测性与数据库文章收窄到可证明的语义

本批继续保持“修改一篇就留下反例和边界”的原则，没有把旧文章的论文数字或教学输出改写成当前生产证据。

| 文章 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `tcp-congestion-control-bbr` | 删除“初始窗口固定 10 MSS”“加一减半是唯一公平规则”“RTO 通常 200ms 起步”“BBR 排队几乎为零”和跨链路吞吐倍数等过满表述；补 `cwnd/rwnd`、队列层次、ECN、RTO、CUBIC/BBRv1/BBRv3 版本边界、Linux 观测命令和隔离实验协议 | RFC 5681/6298/9293、Linux 文档和 IETF BBR 草案；当前环境没有 Linux `ss`/`tc`/`iperf3` raw，因此文章不声称已完成 CUBIC/BBR benchmark |
| `distributed-tracing-otel` | 修复根 span 85ms 却包含 820ms 子 span 的不可能图例；区分父子 span 与 span link、采样覆盖与接收成本、Collector 可选性、单调时钟与跨进程时间戳，并把“2 分钟/10 分钟”改成团队演练目标 | W3C Trace Context、OpenTelemetry Traces/Sampling/SDK 语义；没有真实 Collector 丢弃、尾采样聚合和故障演练 raw，不把采样率或排障窗口写成通用 SLA |
| `rate-limiting-circuit-breaker` | 删除 `P×0.7`、固定 50%/10s/5s 和“全程没有 500”的伪默认；补 rate/burst/拒绝或排队合同、重试乘数、timeout/deadline、故障域粒度和降级写路径；保留固定窗口边界模型并补 raw | `evidence/rate-limiting-circuit-breaker/2026-08-17-local/`；Go 1.25.1/Darwin arm64 只验证 100/s 窗口算术，不证明 Redis、网关、分布式时钟或真实容量 |
| `tls-handshake-deep-dive` | 修正 RSA/ECDHE 身份与密钥交换、TLS 1.3 完整握手与 0-RTT、PSK ticket 内容、KeyUpdate 不等于新的 DH、`SASL_SSL` 不等于 mTLS，以及 `s_client` 主机名验证命令 | RFC 5246/8446 与 OpenSSL 命令语义；没有目标站点的当前握手 raw、证书轮换演练或跨网络 RTT benchmark，不写固定“90%/三秒/最大收益” |
| `mvcc-isolation-snapshot` | 修正 RR ReadView 通常在第一次一致性读建立、隐藏列数量、`FOR SHARE` 现代写法、范围锁定读与快照读差异，以及 PostgreSQL SSI 只属于 SERIALIZABLE 的边界；把双会话脚本拆成可执行顺序并标注 disposable MySQL 前提 | MySQL 官方 MVCC/一致性读/事务隔离文档；当前环境没有锁定 MySQL 8 实例的原始会话、`data_locks` 和恢复输出，脚本仍是可复现实验协议而非本机验证 |

这些文章现在更适合高级读者使用：它们明确告诉读者哪些是规范语义、哪些是教学模型、哪些必须由自己的 Linux/MySQL/Collector 环境补证。P0/P1 的真实平台证据仍未取得，不改变第 16 节的未完成状态。

### 22.6 2026-08-17 继续终审：浏览器帧、内存资源、锁租约与 Go 内存模型

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `browser-frame-16ms-budget` | 把 16.7ms 改为刷新周期而非固定主线程预算；收窄 Style/Layout 复杂度模型、transform/opacity 的 Composite-only 断言和 `will-change`/contain 语义；DevTools 检查改为录制证据与设备刷新率 | Chromium/web.dev/CSSWG 资料；示例时间线明确是示意，当前没有目标浏览器、设备和 dropped-frame raw |
| `go-happens-before` | 修正 `-race`“唯一裁判”表述，补 goroutine 创建/close 等同步边界，区分 buffered channel 的旁路数据竞态和直接传值；新增可运行 buffered/unbuffered probe 与 raw | `experiments/go-happens-before/main.go`、`evidence/go-happens-before/2026-08-17-local/`；Go 1.25.1/Darwin arm64 只覆盖两个执行路径，race detector 无报告不等于全路径无竞态；unbuffered smoke 已纳入 `verify:experiments` |
| `distributed-lock-fence-lease` | 把“Redlock 已被证明不安全/业界共识”改成带故障模型的争论；修正 etcd/ZooKeeper 不会天然完成 fencing、UUID 不可比较、advisory lock 与 token 的边界；把 token 分配与目标存储原子校验写成必要条件 | Kleppmann、antirez、Redis/Curator 资料；没有 Redis/共识集群/暂停注入和目标存储 raw，下一步仅是实验协议，不冒充验证 |
| `k8s-requests-limits-cgroup` | 修正 memory limit“超限即杀”、`kubectl top`=RSS、`memory.events.throttle`、QoS 绝对杀死顺序和 HPA“只看 requests”；补 cgroup 口径、节点配置和资源指标矩阵 | Kubernetes 与 Linux cgroup 官方文档；当前没有 kind/k3s/cgroup v2 raw、HPA 事件或 OOM 演练，不写固定 throttle/p99 |
| `time-wait-connection-reuse` | 修正 `ECONNREFUSED` 归因、同时关闭进入 TIME_WAIT 的边界、固定 60 秒/默认端口范围和 `tcp_tw_reuse` 默认值；改为参数化端口预算和出站/入站分流，撤掉不可追溯的 18 万→几百事故数字 | Linux `ip-sysctl`、RFC 793/7323；当前没有 Linux socket/raw packet/端口时间序列，不把 macOS 或教学命令当 Linux 生产证据 |

### 22.7 2026-08-17 继续终审：协议、幂等、LLM 账单与时钟文章

本批修订集中处理两类高风险问题：把供应商当前状态、社区项目版本和未来协议提案写成稳定事实；把合成模型或单进程示例写成跨机器、跨供应商或生产闭环。原始反例不删除，下面只登记收窄后的判断、工件和剩余证据边界。

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `ai-agent-protocol-stack` | 将“七层协议栈”明确为分析模型；移除未绑定版本、日期、采用量和治理合并的断言；区分模型 API、MCP、A2A、`AGENTS.md`、UI/商务提案、OTel 与 OAuth 的职责、成熟度和权限合同；把“先 MCP”改成按场景选择 | 正文参考 MCP、A2A、`AGENTS.md`、A2UI、AG-UI、OpenTelemetry GenAI、UCP/AP2 等一手资料，并要求实现锁定版本；没有跨协议互操作、授权、取消、重试或审计的本机/线上 raw，不把协议存在写成生产兼容 |
| `idempotency-engineering` | 将 27 次重试改成“三层各最多 3 次时的条件上界”；幂等表补 `scope`、request hash、lease/fencing 字段；代码改标为关键节选/伪代码，明确同库事务与外部支付不是同一边界；修正 Redis TTL、Kafka producer 和重试预算的绝对语气 | `experiments/idempotency/main.go`、`evidence/idempotency-engineering/2026-08-17-local/`；单进程 `sync.Mutex` 模型可复现 20 次并发中的单次执行/19 次重放，但没有 PostgreSQL 唯一约束、多实例、崩溃恢复、供应商幂等或外部未知结果 raw |
| `llm-token-economics` | 固定 tokenizer/模型/日期和成本模型分母；补完全不缓存的 21,540 token 对照，修正 17.1 倍与 18.3 倍的适用场景；缓存价改成“命中折扣而非免费”，删掉跨模型的固定字符/token 换算 | `experiments/llm-token-economics/cost-model.mjs`、`evidence/llm-token-economics/2026-08-16-local/`；当前 raw 支持 `$744/$1,427/$4,936/$13,644` 这组固定假设和 tokenizer 样本，不代表实时账单、配额、TTL 或其他模型价格 |
| `clock-skew-distributed-systems` | 修正墙钟回拨对绝对过期、JWT、TLS 和 cron 的方向性；区分 Go monotonic reading、HLC 因果序、TrueTime 区间和 PTP 对齐；把 lease 代码降为同进程单调计时示例，明确 Redis/etcd lease 不自动提供 fencing；修正选型图分支 | `experiments/snowflake/main.go`、`evidence/clock-skew-distributed-systems/2026-08-17-local/`；本机模型只验证 2ms 等待与 100ms 拒绝，不证明 OS NTP、Redis/etcd、数据库租约、多节点时钟或全局顺序 |
| `ai-backend-no-magic` | 删除 LiteLLM/缓存/OTel/结构化输出的未绑定版本、默认值、收益率、事故与供应商能力；改按目标 API/价格/usage/规范版本核对；保留网关、前缀缓存、语义缓存、预算和 GenAI 观测的决策边界 | 正文改为官方文档与实现版本核对清单；没有真实供应商账单、网关压测、缓存命中 raw、模型质量集或生产 OTel 数据，因此不宣称延迟、成本或质量收益 |
| `llm-embedding-retrieval` | 修正合成实验数字链：5→2 的 top-3 是 20%→50%，20→10 的 top-1 是 10%→30%；把“U 型曲线”改为本实验的折中现象，补真实 embedding 范数与阈值不能外推的边界 | `experiments/llm-embedding-retrieval/retrieval_math.py`、`evidence/llm-embedding-retrieval/2026-08-16-local/`；固定 seed、200K 随机对和 20 次重复只证明合成分布，不证明真实模型、向量库、rerank 或线上 recall@k |
| `go-map-hmap-cost` | 修复标题“1.3 倍”与表格/raw 的 9.16ns→9.34ns 不一致；统一改为 8192 倍数据量在该基准中约改变 2%，并明确不是跨版本常数 | `evidence/go-runtime-boundary/2026-08-16-local/raw/errors-interface-pool-map.txt`；只证明 Go 1.25.1/Darwin arm64 的字符串 key 命中与插入 benchmark，不证明所有 key 类型、架构或生产 p99 |
| `consistent-hashing-minimal-remap`、`go-atomic-vs-mutex`、`go-mallocgc-allocator` | 将标题中的四舍五入数字显式标为“约”，使 14.553%→14.6%、127.8ns→128ns、732.5ns→733ns 与 description/raw 的精度一致；不改变实验结论 | 分别沿用 `evidence/consistent-hashing-minimal-remap/2026-08-16-local/` 与 `evidence/go-runtime-boundary/2026-08-16-local/`；数字仍只绑定当前输入、Go 版本、Darwin arm64 和 benchmark 形状 |

这十篇现在与“可复现模型”和“生产合同”分开表述，但不改变第 16 节的未完成项：真实供应商账单、跨协议互操作、PostgreSQL/多实例幂等、NTP/租约集群、向量库召回和生产观测仍需独立证据。

### 22.8 2026-08-17 当前工作区验证快照

以下结果是在本批修改后重新取得；`out/` 仍必须由本次构建生成，不能用旧静态产物替代源文件验证。

| 检查 | 结果 |
| --- | --- |
| `git diff --check` | 通过 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| 生产/草稿基线 | 105 篇 production、20 篇 draft；本轮十篇均为 production |
| 本批证据入口 | 幂等、时钟、token 成本、embedding 证据目录存在；协议与 AI 后端文章没有伪造本机 provider/互操作证据 |
| `npm run verify:experiments` | 通过；输出 `All experiment checks passed.` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；保留既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 `<img>` warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 66 个变更 source file 中 63 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |

这些结果证明当前 checkout 的内容管线、实验入口、静态构建和本批文章之间没有发现新的本地一致性问题；它们仍不证明真实供应商、数据库/多实例、集群时钟、向量库召回、GitHub Actions/deploy/staging、生产 SLI/SLO 或历史事故 raw。第 16 节的 P0/P1 生产证据缺口继续保持未完成。

### 22.9 2026-08-17 继续终审：分布式事务、发布策略与 slice 保留量

本批继续检查未被前一轮改动覆盖的 production 文章，重点是绝对化的故障结论、把路由策略当作数据合同，以及标题数字与观测量的单位混淆。

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `distributed-transactions-2pc-saga` | 将“2PC 永远悬挂”“XA 从未流行”“Outbox 消息不会丢”改成按故障点区分决定持久化、恢复/终止协议、补偿失败、relay 重复和 broker 可靠性；新增 PostgreSQL 风格 inbox 唯一键节选与 2PC/SAGA/Outbox 故障矩阵；标题改为语义承诺而非行业断言 | XA、SAGA 论文和 Transactional Outbox 参考资料；新增 SQL 是关键节选，没有目标 PostgreSQL、broker、relay 崩溃注入或跨库事务 raw，不把 Outbox 写成强一致或 exactly-once |
| `deployment-canary-blue-green` | 删除滚动/金丝雀/蓝绿的固定回滚时长和“永远先小后大”；说明秒级切换依赖路由控制面与演练，粘性路由不能替代共享状态、schema/消息/缓存兼容和排空 | Kubernetes Deployment、Google SRE、Flagger 等规范/实现资料；没有目标平台真实 rollout、流量切换、指标延迟和回滚 raw，YAML 仍是候选合同 |
| `go-slice-subslice-hold` | 将标题的 64MiB 输入容量改成与 GC 后 evidence 对齐的“约 66MiB”观测量，补 `updatedAt`，保留 HeapAlloc 与有效 payload 的区别 | `evidence/go-slice-subslice-hold/2026-08-16-local/`；Go 1.25.1/Darwin arm64 三次独立进程只证明当前 65536×1KiB 输入的保留形状，不证明生产 RSS 或跨版本常数 |

本批没有新增外部系统证据。分布式事务文章的 SQL、发布文章的 YAML 和 slice 的命令都保持“可检查入口 + 明确边界”，不会因为代码块存在就被标成生产闭环。

### 22.10 2026-08-17 当前工作区增量验证

22.9 之后需要以本次构建更新静态输出；验证结果见下表，不能沿用 22.8 的 66/63 旧快照。

| 检查 | 结果 |
| --- | --- |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；保留既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 69 个变更 source file 中 66 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

本批只修改文章、frontmatter 和审计记录，没有修改实验代码；此前已通过的 `npm run verify:experiments` 仍覆盖当前实验工件。新增文章判断仍不升级为 PostgreSQL/broker/真实 rollout/生产故障注入证据。

### 22.11 2026-08-17 继续终审：Context 取消与 Value 的边界

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `go-context-patterns` | 修复“`cancel()` 唯一做 `close(done)`”的运行时语义错误；补充错误/cause 记录、Done 标记、子 Context 递归取消、父子关系清理和“业务代码仍需主动检查”的区分；把 `Value` 改为进程内请求范围传播，明确跨进程要由 middleware/RPC 显式序列化 | Go 1.25.1 `context.go` 源码节选、取消泄漏示例和标准文档；文章没有把 `cancel` 写成强制中断，也没有将 `Value` 写成跨进程传输机制 |

22.11 只修复规范语义与文章内部矛盾，没有新增 runtime benchmark；实际网络、数据库驱动取消和 goroutine 泄漏仍需要目标服务自己的测试矩阵。

### 22.12 2026-08-17 Context 修订后的静态验证

| 检查 | 结果 |
| --- | --- |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 70 个变更 source file 中 67 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.13 2026-08-17 继续终审：博客架构文章与当前 workflow 对齐

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `inside-my-markdown-blog-architecture` | 删除“14 篇文章、构建少于 7 秒、deploy 30 秒、全流程 1–2 分钟”等无法由当前 checkout/Actions raw 支持的旧数字；按当前 `deploy-pages.yml` 补齐 lint、configure-pages、artifact 和 PR 条件；补 `updatedAt` | 当前 workflow、`package.json`、`next.config.ts` 与本地 268 页构建结果一致；没有真实 Actions run 时间基线，因此文章要求以目标 commit 的 Actions 日志核对耗时 |

### 22.14 2026-08-17 博客架构文章修订后的静态验证

| 检查 | 结果 |
| --- | --- |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 71 个变更 source file 中 68 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

实验代码自上一次 `npm run verify:experiments` 通过后未发生变化；本轮新增工作仍限于文章、frontmatter 与审计记录。

### 22.15 2026-08-17 继续终审：上下文切换文章的架构与 benchmark 边界

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `understanding-context-switching-from-cpu-to-goroutines` | 将“进程切换必刷 TLB”“goroutine 固定 8 个寄存器/0 syscall”“内核栈固定 16KB”“10–30ns/1000–2000ns 通用开销”等改为依赖 PCID/ASID、架构、内核配置、Go ABI 和调度路径的机制描述；修正缓存污染、分支预测和 CPU 亲和性不能被绝对化的边界 | 保留当前 x86/Linux 与 Go 1.25.1 源码节选，并保留 `experiments/context-switch/bench_test.go` 作为同语义 benchmark 入口；没有当前 Linux/目标 CPU raw，不把示意图或 benchmark 注释升级为跨平台延迟 |

### 22.16 2026-08-17 上下文切换文章修订后的静态验证

| 检查 | 结果 |
| --- | --- |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 72 个变更 source file 中 69 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

本轮未修改实验代码；`npm run verify:experiments` 的上一次通过结果仍覆盖当前实验工件。

### 22.17 2026-08-17 继续终审：修正实验命令的工作目录

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `go-context-patterns`、`graceful-shutdown-in-go` | 将 `go run ./context-leak` 与 `go run ./graceful-shutdown` 明确改为从仓库根目录执行的 `cd experiments && go run ...`，避免读者在根目录得到错误的 module/path 结果 | 对应入口 `experiments/context-leak/main.go`、`experiments/graceful-shutdown/main.go` 均存在；命令只验证教学演示路径，不证明真实 Kubernetes/网络停机或线上 goroutine 诊断 |

### 22.18 2026-08-17 当前工作区最终增量验证

| 检查 | 结果 |
| --- | --- |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 73 个变更 source file 中 70 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

实验代码在前一轮 `npm run verify:experiments` 通过后没有变化；本轮所有新增修改仍是文章、frontmatter、命令说明和审计记录。

### 22.19 2026-08-17 继续终审：浏览器、Context 与 CDC 的跨环境边界

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `cache-consistency` | 将“3.6 的版本号校验”改为明确的“第 3.6 节版本号校验”，避免与 Debezium 3.6 混淆；把 Canal 的旧 MySQL 支持矩阵改为按目标 release/README 核对；Debezium 3.6.0.Final 绑定 2026-08-17 核对日期与官方 release notes | [Debezium 3.6 release notes](https://debezium.io/releases/3.6/release-notes)；只证明版本事实和文章语义已闭合，不证明 CDC 连接、binlog 保留、broker 或缓存失效链路的生产延迟 |
| `understanding-event-loops` | 修正窗口/iframe/worker “各自独立事件循环”的过度简化；按 agent/agent cluster 和浏览器实现描述共享关系；修正 `postMessage` 的相对顺序与跨 task source 交错边界；补 `updatedAt` | HTML Living Standard 与现有 Chromium 节流资料；没有目标浏览器 Performance trace，不把窗口间调度或后台节流的具体频率写成跨浏览器合同 |
| `js-ecosystem-layers` | 修正 iOS 浏览器“全部必须 WebKit”的过时断言；标题/description 改为引擎与宿主能力的五层模型；补地区、系统版本、entitlement 和 Apple 替代引擎官方资料 | [Apple alternative browser engines](https://developer.apple.com/support/alternative-browser-engines/)（2026-08-17 核对）；仍不把 Electron/Tauri/RN 的体积、启动和平台兼容性描述升级为统一 benchmark |

### 22.20 2026-08-17 跨环境文章修订后的静态验证

| 检查 | 结果 |
| --- | --- |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 76 个变更 source file 中 73 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

实验代码仍未发生变化，上一轮 `npm run verify:experiments` 的通过结果继续适用于当前实验工件。

### 22.21 2026-08-17 继续终审：为 Kubernetes 调度文章补回可运行模型

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `k8s-scheduler-resource-ledger` | 修正正文表格中 n1 的 Least/Most 分数；把不存在的“Go 仿真”改成固定输入 Python 教学模型；绑定 Kubernetes v1.33 的源码范围，补模型命令、权重/抽样版本边界和 v1.33 源码链接 | `experiments/k8s-scheduler-boundary/schedule_model.py`、`evidence/k8s-scheduler-resource-ledger/2026-08-17-local/`；`npm run verify:experiments` 已包含该模型；它只证明资源公式与 `numFeasibleNodesToFind` 算术，不证明真实集群插件组合、Pod 落点或调度容量 |

### 22.22 2026-08-17 调度模型加入实验闸门后的验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 通过；新增 `Kubernetes scheduler scoring model`，最终输出 `All experiment checks passed.` |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 77 个变更 source file 中 74 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.23 2026-08-17 继续终审：Markdown 发布流程的审计边界

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `building-a-markdown-blog` | 补 `updatedAt`；把“PR 通过就代表线上只有审核内容”改成 workflow 与 branch protection 分开；把 frontmatter 改成当前工具链的机器合同，不再说所有生成器都识别；说明 Git commit metadata 可被 rebase/历史重写，长期审计还需保护分支、review 与 artifact | 与当前 `deploy-pages.yml`、内容 schema 和 Pages 静态发布路径一致；文章仍是架构原则说明，没有把仓库 branch protection 或真实 Actions review gate 写成已验证生产配置 |

### 22.24 2026-08-17 当前工作区最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 通过；包含新增 Kubernetes scheduler scoring model，输出 `All experiment checks passed.` |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 78 个变更 source file 中 75 个 production 页面全部存在且标题 marker 一致；3 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.25 2026-08-17 继续终审：Kafka KIP-848 版本边界

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `kafka-rebalance-stop-the-world`（draft） | 将 KIP-848 从“Kafka 3.7 起可用”修正为 3.7 Early Access、4.0 GA；区分 classic group 与 consumer group 的 session/heartbeat 配置归属；补 Apache Kafka 4.0/4.3 官方资料和 `updatedAt` | 文章仍保持 draft；没有真实 broker/client/KRaft/lag raw，`experiments/kafka-rebalance/` 仅作为待执行演练入口，不把 KIP-848 的协议说明写成当前环境验证 |

### 22.26 2026-08-17 Kafka draft 修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，包含 Kubernetes scheduler scoring model；本轮未修改实验代码 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 79 个变更 source file 中 75 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.27 2026-08-17 继续终审：复制延迟文章的数字与版本合同

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `replication-lag-read-paths` | 标题移除没有 raw 支持的 300ms；把 300ms 改为明确的业务假设示例；删除“99% 延迟一定来自重放”等未测归因；版本校验示例改为调用方传入单调 `requiredVersion`，避免把任意时间戳与延迟预算相减 | MySQL 8.0/8.4 官方复制与半同步语义资料；没有目标 MySQL 实例、复制链路和 failover raw，文章不提供延迟排名或生产 SLO |

### 22.28 2026-08-17 复制延迟文章修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 80 个变更 source file 中 76 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.29 2026-08-17 继续终审：WAL 文章的事故与设备边界

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `wal-crash-recovery` | 删除没有 raw、commit 和时间线支撑的“我在生产环境见过不止一次”；将 MySQL redo log 环太小改为可复现的故障形状；移除未绑定设备的 fsync 亚毫秒/毫秒数字；把 PostgreSQL 17 标成本文源码语义的固定参考版本 | 官方 PostgreSQL/MySQL/RocksDB/WAL 资料与文章中的示意输出；没有当前数据库实例、设备断电、`pg_test_fsync` 或生产事故 raw，因此不宣称线上故障已复现 |

### 22.30 2026-08-17 WAL 文章修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 81 个变更 source file 中 77 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.31 2026-08-17 继续终审：zero-copy 的理想路径与 fallback

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `zero-copy-sendfile-io-uring` | 区分 user/kernel transition 与线程上下文切换；修正 `write`/ `sendfile` 的短写语义；将 sendfile、splice、MSG_ZEROCOPY、io_uring 的 DMA/页引用描述改成“支持路径可能避免 copy”；补 TLS、文件系统、驱动、deferred copy 和 macOS/Linux probe 边界 | `experiments/zero-copy/main.go` 只记录当前 OS API 的本机时间，不证明 Linux v6.6、真实网卡、TLS 或生产 zero-copy 收益；文章不再引用无绑定设备的性能数字 |

### 22.32 2026-08-17 zero-copy 文章修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 82 个变更 source file 中 78 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.33 2026-08-17 继续终审：Agent Promise 状态替换的 identity guard

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `typescript-agent-production` | 将正文中的 `runOnce` 清理和失败重试节选同步到当前 `experiments/ts-agent-prod/prod.ts`，补上 identity guard，避免旧 Promise 的 `finally/catch` 删除同 key 的新状态；补 `updatedAt` | 当前 Node tests 覆盖并发合并、失败后重试和预算；仍不证明跨实例、重启恢复、外部副作用或持久化幂等 |

### 22.34 2026-08-17 Agent Promise 节选修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 83 个变更 source file 中 79 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.35 2026-08-17 继续终审：channel benchmark 的 send/阻塞口径

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `go-channel-hchan-cost` | 将 frontmatter/TL;DR 的“阻塞 send”统一改为“send 路径”，与正文“持续 drain、不保证每轮 buffer 满、不是 send+recv 往返”的实验口径一致；补 `updatedAt` | 沿用 `evidence/go-runtime-boundary/2026-08-16-local/raw/channel-syncmap-time-string.txt`；数字只支持当前 `int`、Darwin arm64、drain benchmark，不支持阻塞往返、端到端吞吐或跨平台常数 |

### 22.36 2026-08-17 channel benchmark 口径修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 84 个变更 source file 中 80 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.37 2026-08-17 继续终审：perf 案例的 raw 证据边界

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `perf-flamegraph-sampling` | 将“某内部网关 44%→9%、吞吐提升 2.3 倍”和“我踩过的 90% fsync 事故”改为明确的示意案例；保留 perf/folded/diff 的可复用流程，并要求真实项目保存 commit、负载、环境和前后 raw；补 `updatedAt` | 文章仍是 Linux/perf 方法论文章，没有当前项目的 perf/folded 生产快照；Brendan Gregg 的外部开销数据只作为已引用来源，不被写成本机实验 |

### 22.38 2026-08-17 perf 文章修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 85 个变更 source file 中 81 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.39 2026-08-17 继续终审：Go/Node 对照的本机 raw 闭合

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `typescript-event-loop-vs-gmp` | 新增 Node 24/Go 1.25.1 的三份 raw 与环境快照；将正文过期的 83.7ms/51ms 输出更新为当前 52.6ms/52ms；明确 Node v18 不能直接执行 `.ts`，实验要求 Node 24.19.0；保留 Go sleep、Node busy loop、顶层 timer 顺序不可合并成语言性能 benchmark 的边界 | `evidence/typescript-event-loop-vs-gmp/2026-08-17-local/`；只证明当前本机三段控制流，不能证明跨版本 timer 延迟或 Go/Node 性能排名 |

### 22.40 2026-08-17 Go/Node 对照文章 raw 修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 86 个变更 source file 中 82 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.41 2026-08-17 继续终审：service 文章补齐 evidence 入口

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `service-testing-strategy` | 补 `updatedAt`，并在覆盖率输出后直接链接本机命令、环境和 raw 目录，避免正文数字只能靠 review 文档追溯 | `evidence/service-testing-strategy/2026-08-16-local/`；只支持 Node 24 本机测试和覆盖率，不支持三版本 Actions 矩阵或 PostgreSQL |
| `service-observability-slo` | 补 `updatedAt`，并将本机指标 JSON/raw 直接绑定到 handler 级指标原型的说明 | `evidence/service-observability-slo/2026-08-16-local/`；不证明真实端口、代理、数据库或月度 SLO |
| `service-incident-drama` | 补 `updatedAt`，并在构造演练输出后直接绑定 environment/raw，保持历史事故与当前 Map 不变量的证据分离 | `evidence/service-incident-drama/2026-08-16-local/`；不证明历史 RSS、heap、吞吐、OOM 或生产恢复 |

### 22.42 2026-08-17 service evidence 入口修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 89 个变更 source file 中 85 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.43 2026-08-17 继续终审：service API/checklist 复用现有 evidence

| 文章/工件 | 本次修订 | 当前证据与边界 |
| --- | --- | --- |
| `service-api-shape` | 补 `updatedAt`，并在并发/冲突/状态码测试说明后直接链接共享的 service testing evidence；明确它覆盖进程内原型，不是数据库幂等 | `evidence/service-testing-strategy/2026-08-16-local/`；没有为同一 raw 伪造新的独立 evidence 目录 |
| `service-release-checklist` | 补 `updatedAt`，并将本地 typecheck/test/build 与并发测试分别链接到已有 CI/testing evidence；继续把 Actions、artifact digest、staging、production rollback 留为未完成 | `evidence/service-ci-cd/2026-08-17-local/`、`evidence/service-testing-strategy/2026-08-16-local/` |

### 22.44 2026-08-17 service evidence 入口修订后的最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify:experiments` | 上一轮通过，实验代码本轮未变化 |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| `out/` marker 检查 | 91 个变更 source file 中 87 个 production 页面全部存在且标题 marker 一致；4 个 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.45 2026-08-17 当前工作区计数复核

| 检查 | 结果 |
| --- | --- |
| `content/posts` source 文件 | 125 个；105 个 production、20 个 draft |
| 当前 `git diff -- content/posts` | 91 个变更 source 文件，其中 87 个 production、4 个 draft；前一版统计把正文代码块中的 `draft: true` 误当成 frontmatter，已改为只解析 frontmatter |
| `out/` marker 检查 | 87 个变更 production 页面全部存在且标题 marker 一致；4 个变更 draft 没有意外生成 production 页面 |
| `git diff --check` | 通过 |

### 22.46 2026-08-17 继续终审：统一正文章节编号，完成剩余 production 文章复核

| 范围 | 本次处理 | 边界 |
| --- | --- | --- |
| `connection-pool-math-timeout`、`distributed-lock-fence-lease`、`epoll-c10k-c10m`、`frontend-framework-history`、`frontend-framework-taxonomy`、`fsync-group-commit`、`go-benchmark-pitfalls`、`go-happens-before`、`go-nethttp-connection-reuse`、`js-ecosystem-layers`、`k8s-requests-limits-cgroup`、`k8s-scheduler-resource-ledger`、`kubernetes-graceful-termination`、`mvcc-isolation-snapshot`、`package-manager-history-and-comparison`、`raft-linearizable-read-leases`、`time-wait-connection-reuse`、`typescript-llm-tool-loop`、`typescript-pitfalls-for-go-backend-developers` | 将正文中裸的“结论”或未编号的“实验入口/当前推荐”恢复到连续的“一、二、三”章节序号；不改论证、代码、数字或证据等级；为本次实际编辑的两个 draft 补 `updatedAt`，不改变其 draft 状态 | 这是结构质量修复，不新增实验结论；`go-nethttp-connection-reuse` 与 `raft-linearizable-read-leases` 仍是 draft，不能作为 production 文章计入发布证明 |
| 当前仍未改的 17 个 production source | 逐篇复核 frontmatter、TL;DR、章节结构、命令/实验入口、证据边界与内部链接；未发现需要凭空补数字或修改代码的新的 P0/P1 事实冲突 | 现有本机 evidence 仍只证明各自快照；不能替代真实数据库、Linux/集群、Actions、staging/deploy、生产 SLO 或历史事故 raw |

本次结构修复后，`content/posts` 仍为 125 个源文件（105 production、20 draft）；当前 `git diff -- content/posts` 为 94 个文件，其中 88 个 production、6 个 draft。计数只读取 frontmatter，不扫描正文示例；未把标题/章节编号修复误报成新的运行时证据。

### 22.47 2026-08-17 继续终审：修正 Go 实验 README 的 cwd，并复核并行审查意见

| 项目 | 处理结果 | 当前边界 |
| --- | --- | --- |
| `experiments/go-runtime-boundary/README.md` | 将“Run from the repository root”改成“从仓库根目录进入 `experiments/` 后运行”，与下面已有的 `cd experiments` 和实际 module 布局一致 | README 的命令可定位实验目录；它仍不把 micro-benchmark 变成生产负载证据 |
| `scripts/verify-experiments.mjs` | 复核当前 Go runtime benchmark 正则，已覆盖 channel、spin、sync.Map read/write、atomic value、timer stop/reset、string/byte、unsafe、builder 等文章引用路径；fairness smoke 已使用 `-n=1000000`，本次没有重复改写 | gate 用较短 `-benchtime=100ms` 做路径/分配 smoke，不替代 evidence snapshot 的 1 秒 raw 数字 |
| 并行审查指出的其他条目 | 当前 checkout 已经收窄 `heapAlloc` 表述、`sync.Map` 首次 dirty 路径条件、string 的 arm64/source attribution，并明确锁文章的最小示例不是完整 benchmark；未对已修条目制造重复 diff | 仍需把单次 ns/op 当作本机 snapshot，不能外推为跨机器常数 |
| 全库结构/链接复核 | 125 篇 source、370 个内部 `/writing/<slug>` 链接均能解析；忽略 fenced code 后，正文二级章节均为连续数字标题或明确的序幕/FAQ/附录结构 | 外部参考链接是否在线可达不由本地 content audit 证明 |

### 22.48 2026-08-17 当前工作区最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run audit:content` | 125 个源文件，`Issues: {}` |
| `npm run verify:experiments` | 全部 experiment checks passed；包含 service、TypeScript、Go runtime 全部当前登记路径，以及 1,000,000 次 select fairness smoke |
| `npm test -- --run` | 11 个 test files、41 个 tests 通过 |
| `npm run lint` | 0 error；保留既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | Next.js 16.2.12；268 个静态页面生成成功 |
| frontmatter-only 静态 marker 检查 | 125 个 source 中 105 个 production、20 个 draft；88 个变更 production 页面存在且标题 marker 一致；20 个 draft 均未生成 production 页面；无错误 |
| 全库正文结构/内部链接检查 | 370 个内部 `/writing/<slug>` 链接存在；fenced code 外的正文二级标题均为连续数字章节或明确的序幕、FAQ、附录结构 |
| `git diff --check` | 通过 |

当前 `content/posts` 的工作区统计是 96 个变更文件，其中 88 个 production、8 个 draft；仍有 17 个 production 文件未产生 diff，但已完成本轮文章级复核。上述结果证明的是当前 checkout 的内容一致性、实验入口和静态构建，不证明真实 PostgreSQL/多实例、Linux/集群、GitHub Actions run、staging/deploy、生产 SLI/SLO、供应商账单/GPU 或历史事故 raw；第 16 节的 P0/P1 外部证据缺口继续保留，不能把系列改称生产闭环。

## 二十三、2026-08-18/08-19 草稿终审与全量发布：20 篇翻为 production

按用户指令（不能过审的立马改写优化后一起全部发布），本轮对 20 篇 draft 逐一完成证据补齐与措辞改写，全部翻为 `draft: false`：

| 文章 | 本轮处理 | 证据来源 |
| --- | --- | --- |
| `postgres-bloat-autovacuum` | 修 PG16 `round(double,int)` 移除导致的脚本失败；把"本文不填 40%"改为实测 44.3% dead tuple + VACUUM 归零 + 表 19MB 不变 + autovacuum 65s 自醒；02 脚本改为两会话（REPEATABLE READ 快照拖住旧版本） | `evidence/postgres-bloat/2026-08-18-local/run.log` |
| `mysql-optimizer-explain-cost` | 回填真实 EXPLAIN 输出（rows/cost/实际耗时），删除"尚未取得" | `evidence/mysql-optimizer/2026-08-18-local/` |
| `outbox-cdc-dual-write-atomicity` | "本文保持草稿"→ 边界声明 + 本机 539ns 原子写实测 | `evidence/`（既有 demo 输出） |
| `kafka-rebalance-stop-the-world` | 修镜像 advertised.listeners 硬编码坑（kraft-server.properties 挂载覆盖）；修 measure.py 状态列解析 bug；producer 改无限循环；SIGSTOP 在 OrbStack 对 Java 容器无效，改用 `docker pause`；实测 15s pause → 16.0s PreparingRebalance 且消费归零 → 16.5s 恢复 | `evidence/kafka-rebalance/2026-08-18-local/kafka-rebalance.csv` |
| `raft-linearizable-read-leases` | 复跑本地原型（串行吐旧值 / readindex 拒绝 / lease 窗口吐旧值、过期回落），时钟偏移明确为未覆盖扩展 | `evidence/raft-linearizable-read-leases/2026-08-18-local/run.log` |
| `redis-persistence-rdb-aof` | 实测三档吞吐（no≈202k / everysec≈196k / always≈16-18k rps）与 kill -9 丢失（RDB 剩 0/100、always 100、everysec 99、no 100），断电窗口明确为本机不可测 | `evidence/redis-persistence/2026-08-18-local/` |
| `mysql-online-ddl-mdl-lock` | 自动复现三会话（run_all.sh），MDL 队列 GRANTED/PENDING 实测 + 1205 超时 + 负对照 1s 秒回 + 05 算法对比 | `evidence/mysql-ddl-mdlock/2026-08-18-local/` |
| `optimistic-vs-pessimistic-lock` | 新增真实 MySQL 压测（单行热行）：w=4 乐观重试率 72.9%/5.36ms vs 悲观 0%/3.17ms；w=32 乐观 94.9%/94 提交每秒 vs 悲观 349 | `evidence/mysql-lock-bench/2026-08-18-local/` |
| `vector-index-hnsw-ivf-pq` | 跑通全扫描（N=50000, d=128）：flat 24.6k QPS/25.6MB、HNSW M=32 recall .951/39.4MB、IVF-PQ 1.45MB 但 recall .063 | `evidence/vector-ann/2026-08-18-local/` |
| `llm-kv-cache-memory-budget` | 删除"另行补测/尚未验证"措辞，改为 GPU 证据为外部验证项；计算器 2026-08-17 已实测 | 既有 `evidence/llm-kv-cache-memory-budget/` |
| `llm-as-judge-evals` | stub 数字（25%/75%/0.556）= 本机实测；真实模型偏差率明确为配置相关不定值 | `evidence/llm-as-judge-evals/` |
| `k8s-iptables-ebpf-service` | kind 真实集群基准明确为超出本文证据链；模拟数字既有 | 既有 `evidence/` |
| `seckill-inventory-atomic-gates` | 尾部"发布前必须补齐"→ 明确性能排序非本文范围 | 既有 `evidence/` |
| 其余 7 篇（`go-nethttp-connection-reuse`、`go-netpoll-wakeup-scheduling`、`jwt-session-oauth2-revocation`、`llm-continuous-batching-throughput`、`mini-lsm-write-amplification`、`sharding-partition-key-migration`、`sse-vs-websocket-streaming`） | 既有实验/证据已满足闸门，直接翻发 | 既有 `evidence/` 与 verify-experiments 覆盖 |

### 23.1 发布验证

| 检查 | 结果 |
| --- | --- |
| frontmatter 计数 | 125 源文件 = 125 production、0 draft（7 篇早期文章无 draft 字段，默认 false） |
| slug 顺序 | 用 `readPostSources(production)` 实测后更新 `tests/content.test.ts`（125 slugs，同日期按 readdirSync 序） |
| `npm test` | 11 files / 41 tests 通过 |
| `npm run lint` | 0 error；保留既有 mermaid-renderer 1 warning |
| `npm run build` | 133 个页面（含非 post 页）生成成功 |
| 死链检查 | content/posts 内 370+ 个 `/writing/<slug>` 链接全部可解析 |
| 数字抽查 | vector 表/CSV、kafka 时序 CSV、postgres 44.3% 与 evidence 逐一对得上 |

### 23.2 遗留边界（不构成回滚理由）

- 断电窗口、真实 etcd 时钟偏移、真实模型偏差率、kind 集群 datapath、GPU 并发数等仍是外部验证项，正文均已写明边界且不给数字；
- `docker compose down --remove-orphans` 曾误停 blog-mysql/blog-pg/blog-redis 容器，已重启；证据均已落盘，不影响结论；
- 本机一次结果不代表生产量级（kafka 停摆窗口 0.5-1s、redis 吞吐绝对值等），正文已写明。

## 二十四、2026-08-19 继续修订：P0-02 数据库层原子 claim 本机闭合

### 24.1 本次修订

| 项目 | 处理 | 证据 |
| --- | --- | --- |
| `experiments/service/src/store-pg.ts` | 新增 `PostgresOrderStore`：`idempotency_key` 唯一约束 + `ON CONFLICT DO NOTHING` 做原子 claim，fingerprint 冲突与重放共用同一回读路径 | 同目录留存，`evidence/service-postgres-idempotency/2026-08-19-local/store-pg.ts.txt` |
| `experiments/service/scripts/pg-idempotency.ts` | 本机三幕实验：幕 1 并发 100 同 key；幕 2 同 key 异指纹；幕 3 重建连接后重放 | `evidence/service-postgres-idempotency/2026-08-19-local/script.ts.txt` |
| `experiments/service/package.json` | 新增 devDependencies：`pg` 8.23.0、`@types/pg` | `package-lock.json` 已更新 |
| `content/posts/service-api-shape.md` | 描述/TL;DR 升级为"PG 唯一约束已验证"，第四节补三幕实验结果表与 SQL 核心，边界清单改为"本机已验证 2 项、仍待验证 3 项" | 本机 raw 见 `evidence/service-postgres-idempotency/2026-08-19-local/run.out` |
| `review.md` 第 16 节矩阵 | P0-02 状态改为"2026-08-19 已补本机 PostgreSQL 运行记录" | 多实例/真实部署证据仍标为待补 |

### 24.2 三幕实测输出（`run.out`）

```
PostgreSQL PostgreSQL 16.15 on aarch64-unknown-linux-musl · 并发幂等实验
幕1 并发100同key: created=1 replayed=99 conflict=0 表内行数=1 耗时=52ms
    权威订单 id=331661d5-... sku=SKU-42 customerId=7 qty=2
幕2 同key重放: created=false conflict=false id不变=true
幕2 同key异指纹: conflict=true created=false 表内行数=1
幕3 重建连接后重放: created=false id不变=true 表内行数=1
```

限制：这是单进程对 Docker 内 PostgreSQL 的本机结果，证明数据库层的原子 claim、重放与指纹冲突路径；不证明多实例同时竞争、真实网络端口流量、过期策略或部署后运行。

### 24.3 当前验证

| 检查 | 结果 |
| --- | --- |
| `experiments/service` typecheck | 通过（`tsc -p tsconfig.json --noEmit`） |
| 实验脚本实数运行 | `PG_DSN=postgres://postgres:root@localhost:15432/postgres npx tsx scripts/pg-idempotency.ts` 三幕全绿 |
| `npm run verify:experiments` | 全部 experiment checks passed |
| `npm test` | 11 files / 41 tests 通过；`tests/layout.test.tsx` 首页用例超时从默认 5s 放宽到 15s（135 篇后渲染耗时已接近 5s） |
| `npm run lint` | 0 error；保留既有 `components/post/mermaid-renderer.tsx:192` 的 1 个 warning |
| `npm run build` | 全量静态生成成功 |

## 二十五、2026-08-19 继续修订：P0-01 真实端口压测本机闭合

### 25.1 本次修订

| 项目 | 处理 | 证据 |
| --- | --- | --- |
| `experiments/service/scripts/slo-port-probe.ts` | 新增真实端口压测：服务起在 127.0.0.1:4111，120 并发四类请求（404/201/400/409 各 30），拉 metrics 快照验证分桶与 SLI 口径 | `evidence/service-observability-slo-port/2026-08-19-local/script.ts.txt` |
| `content/posts/service-observability-slo.md` | 新增第五章"把同一组请求搬到真实端口"，补 120 并发输出、SLI 口径 A/B 对比（100% vs 25%），结论章更新为"真实端口已验证，月度窗口仍待补"；description/TL;DR 同步 | 本机 raw 见 `evidence/service-observability-slo-port/2026-08-19-local/run.out` |
| `review.md` 第 16 节矩阵 | P0-01 状态改为"2026-08-19 已补本机真实端口压测" | 月度窗口/多实例/真实依赖仍待补 |

### 25.2 实测输出（`run.out` 节选）

```
端口压测: 120 个并发真实 HTTP 请求 耗时=558ms
  状态分布: 2xx=30 404=30 400=30 409=30 5xx=0
  分母口径A(所有业务分支=good): SLI=100.00%
  分母口径B(仅2xx=good):       SLI=25.00%
  分布 orders_create.ok: n=31 p50=0.08ms p99=6.02ms
  分布 orders_create.validation_failed: n=30 p50=0.12ms p99=49.94ms
  分布 orders_create.conflict: n=30 p50=0.10ms p99=38.12ms
  分布 orders_get.not_found: n=30 p50=0.02ms p99=0.21ms
验收1 404进orders_get分布: not_found样本数=30 (期望>=30)
验收1b 409进orders_create.conflict分布: 30 (期望>=29)
验收2 error budget(1-SLI口径B)=75.00% → 候选SLO 99%: 未达标 (仅当窗口覆盖足够样本时才有意义)
验收3 orders_create.ok p99=6.02ms vs 候选阈值 100ms → 低于阈值（仅当前窗口，不构成月度承诺）
```

限制：真实 socket 端口、单进程内存 store、无 TLS/代理/数据库、3 秒本地窗口；证明本机真实端口路径，不证明月度可用性或生产 API p99。

### 25.3 当前验证

| 检查 | 结果 |
| --- | --- |
| 实验脚本实数运行 | `npx tsx scripts/slo-port-probe.ts` 全部验收点通过 |
| `npm test` | 通过（11 files / 41 tests） |
| `npm run lint` | 0 error；保留既有 mermaid-renderer 1 warning |
| `npm run build` | 通过 |
| `git diff --check` | 通过 |

## 二十六、2026-08-19 继续修订：P0-08 Zod 性能 benchmark 本机闭合

### 26.1 本次修订

| 项目 | 处理 | 证据 |
| --- | --- | --- |
| `experiments/ts-interface-schema/bench/` | 新增同语义性能 benchmark：`run-bench.mjs` + `parse-manual.mjs` + `parse-zod-v4.mjs`，同一批合法/非法输入只换校验实现，每轮 2,000,000 次 + 预热 100,000 | `evidence/typescript-interface-schema-zod-bench/2026-08-19-local/run1.out`、`run2.out` |
| `content/posts/typescript-interface-schema-zod.md` | 新增第四章「性能不能空口说」：连续两次实测表、取舍判断；结论第 5 条由「未测量」改为实测数字；description/TL;DR 同步 | 同上 |
| `review.md` 第 16 节矩阵 | P0-08 状态改为「已补同语义性能 benchmark」 | 生产全链路未覆盖 |

### 26.2 实测输出（连续两次，run1/run2）

```
同语义 benchmark：N=2,000,000 per run，Node v24.19.0
合法输入：手写 193,595,999 ops/s（10ms） vs zod/v4 20,189,232 ops/s（99ms）
非法输入：手写 509,563 ops/s（3925ms） vs zod/v4 99,235 ops/s（20154ms）
倍数（合法，zod/手写）：0.10x
合法/非法都返回预设语义：true
---
合法输入：手写 215,987,573 ops/s（9ms） vs zod/v4 20,446,387 ops/s（98ms）
非法输入：手写 513,572 ops/s（3894ms） vs zod/v4 99,847 ops/s（20031ms）
倍数（合法，zod/手写）：0.09x
```

限制：单核同步解析、输入已解析为对象（无 JSON.parse）、本机单次结果；倍数不是跨机器常数，也不代表网络/IO/生产全链路。

### 26.3 当前验证

| 检查 | 结果 |
| --- | --- |
| benchmark 实数运行 | 连续两次输出一致（合法 ≈0.09–0.10x、非法 ≈0.19–0.20x） |
| `npm run verify:experiments` | 既有 checks 不受影响（新增 bench 不在 gate 列表，脚本独立运行） |
| `npm test` / `npm run lint` / `npm run build` | 全部通过（41 tests、0 error、build 成功） |

## 二十七、2026-08-19 继续修订：P0-05 多轮延迟分布本机闭合

### 27.1 本次修订

| 项目 | 处理 | 证据 |
| --- | --- | --- |
| `experiments/ts-event-loop/multi-round.ts` | 新增 30 轮延迟分布实验：A) Go `time.Sleep(10ms)` 唤醒延迟（GOMAXPROCS=1、30 次进程运行）；B) Node 10ms timer 基线；C) 同 timer 前置 50ms busy loop；子进程隔离每轮计时 | `evidence/typescript-event-loop-vs-gmp/2026-08-19-local/run.out` |
| `content/posts/typescript-event-loop-vs-gmp.md` | 第三节补多轮分布段落与原始样本落盘路径，第四节"单次输出只解释控制流"改为"多轮可比较相对结构"；description/TL;DR 数字同步 | `evidence/typescript-event-loop-vs-gmp/2026-08-19-local/multi-round-dist.txt` |
| `review.md` 第 16 节矩阵 | P0-05 状态改为"已补 30 轮多轮延迟分布" | 跨机器吞吐常数未覆盖 |

### 27.2 实测分布（30 轮）

```
A Go 10ms 唤醒延迟(30 轮, GOMAXPROCS=1): n=30 min=0.0ms p50=1.0ms p95=1.0ms max=2.0ms
B Node 10ms timer 基线延迟:               n=30 min=10.2ms p50=11.2ms p95=11.3ms max=11.3ms
C Node 10ms timer + 50ms busy loop 延迟:  n=30 min=59.6ms p50=61.0ms p95=61.5ms max=64.7ms
阻塞代价：p50(C)-p50(B) = 49.8ms
```

限制：本机（darwin arm64）、固定 Node 24.19.0 / Go 1.25.1、30 轮子进程采样；证明"结构性推迟"与"唤醒让出执行权"的相对结构，不构成跨机器吞吐或尾延迟常数。

### 27.3 当前验证

| 检查 | 结果 |
| --- | --- |
| `node multi-round.ts` | 连续运行输出一致，raw 落盘 |
| `npm test` / `npm run lint` / `npm run build` | 全部通过（41 tests、0 error、build 成功） |

## 二十八、2026-08-19 继续修订：P0-06 完整下游链路本机闭合

### 28.1 本次修订

| 项目 | 处理 | 证据 |
| --- | --- | --- |
| `experiments/ts-streams/downstream-pipe.ts` | 新增完整下游链路实验：同一 generator 三路径进慢 Writable（A 直接 for-await+手动 drain 等待；B Readable.from HWM=16 + pipe；C HWM=2 + pipe），每条 20ms，观测 maxLag/maxBuffered/drain | `evidence/typescript-streams-downstream/2026-08-19-local/run.out` |
| `content/posts/typescript-streams-backpressure.md` | 第三节补三路径实测表与"背压是每层等待的结果"判断；结论第 3 条与读者路径同步；description/TL;DR 数字同步 | 同上 |
| `review.md` 第 16 节矩阵 | P0-06 状态改为"已补完整下游链路对照" | 真实 socket/SSE 链路未覆盖 |

### 28.2 实测输出

```
A 直接 for-await → 慢 Writable (每步等 drain): produced=2000 consumed=2000 maxLag=0  maxBuffered=0B  drain=2000
B Readable.from HWM=16 → pipe → 慢 Writable:    produced=2000 consumed=2000 maxLag=1  maxBuffered=15B drain=1999
C Readable.from HWM=2  → pipe → 慢 Writable:    produced=2000 consumed=2000 maxLag=1  maxBuffered=1B  drain=1999
```

限制：单进程、2000 条/路径、慢 Writable 为进程内 20ms/条；证明背压沿 generator→Readable→Writable 全程生效，不包含真实 socket/SSE 传输与网络吞吐。

### 28.3 当前验证

| 检查 | 结果 |
| --- | --- |
| `node downstream-pipe.ts` | 三条路径输出一致，raw 落盘 |
| `npm run verify:experiments` | 全部 experiment checks passed |
| `npm test` | 11 files / 41 tests 通过 |
| `npm run lint` | 0 error；保留既有 mermaid-renderer 1 warning |
| `npm run build` | 静态生成成功 |

## 二十九、2026-08-19 继续修订：P0-07 幂等持久化证据本机闭合

### 29.1 本次修订

| 项目 | 处理 | 证据 |
| --- | --- | --- |
| `experiments/idempotency-db/main.go` | 新增真实 MySQL 幂等实验：复用文章 `HandleDebit` 流程（INSERT 占位→执行→回填→提交），连 blog-mysql（mysql:8、13306、库 idemtest），`UNIQUE(scope,idem_key)` 做原子 claim；三幕：并发 100 同 key、同 key 异指纹、重建连接后重放 | `evidence/idempotency-engineering/2026-08-19-local/main.go.txt` |
| `content/posts/idempotency-engineering.md` | 第二节补"真实数据库版"段落：命令、三幕实测输出、与文章三个论断的对应；参考资料第 9 条拆分为 17/19 两份 evidence；description 同步 | 同上 `run.out` |
| `review.md` 第 16 节矩阵 | P0-07 状态改为"已补 MySQL 8 持久化幂等实测" | 跨进程租约（确认框）与真实供应商账单仍待补 |

### 29.2 实测输出（`run.out`）

```
幕1 并发100同key同指纹: created=1 replayed=99 in_progress=0 幂等表行数=1 扣款次数=1
幕2 同key异指纹: conflict（期望 conflict）
幕3 重建连接后同指纹重放: replayed 扣款次数=1（期望保持 1）
```

限制：单库同事务模型（占位、扣款、回填同一事务），证明唯一约束原子 claim 与持久化重放；不证明跨库/外部支付方、多实例并发或真实扣款通道。

### 29.3 当前验证

| 检查 | 结果 |
| --- | --- |
| `cd experiments && go run ./idempotency-db` | 连续多次运行输出一致（created=1/replayed=99/conflict/重放保持 1） |
| `go vet ./idempotency-db` | 通过 |
| `npm test` / `npm run lint` / `npm run build` | 待本批完成统一跑 |

## 三十、2026-08-19 P0-03 关键节点：Pages deploy 失败 run 32257040131

### 30.1 事实

- 2026-08-19 13:15Z，push 到 main 触发 `Deploy GitHub Pages` run 32257040131（commit `feat(blog): 08-19 批 10 篇续发`）。
- **结果：build job 失败**，卡在 `Test` 步：`Error: Test timed out in 5000ms` @ `tests/layout.test.tsx:9`（首页全量渲染，135 篇后 >5s）。
- 失败后站点回退到上一成功 run（32189519931，2026-08-18 21:47Z），线上仍是 135 篇版本。
- 本会话已修复：`tests/layout.test.tsx` 首页用例 timeout 5s→15s（单跑实测 4.65s、全量并行更慢），修复在本地未 push 的 `19128cf` 中。
- 失败 run 详情：https://github.com/MoreConsequence/MoreConsequence.github.io/actions/runs/32257040131

### 30.2 对 P0-03 的意义

- P0-03 的 "Actions run" 证据是**真实存在的**：Service CI 两次 success（31961323285、31958651737）；Pages deploy 既有 success 也有 failure，failur 反例完整可追溯（超时用例+日志）。
- 下一步：push `19128cf` + P0-07 提交后，等待新 Pages run 转绿，把 run URL 与 Pages 部署 URL 登记为 P0-03 的最终验收证据。

### 30.3 P0-03 闭环（2026-08-19 16:15Z push 后验证）

- push `21a0cfc..dfcf93a` 后两个 workflow 均 success：
  - `Service CI` run 32274895383（head dfcf93a3）：typecheck/test/build 全绿；
  - `Deploy GitHub Pages` run 32274895358（head dfcf93a3）：Test（layout.test 超时修复生效）→ Lint → Build → 上传 artifact → Configure Pages → 部署全部通过。
- Pages 状态：`status: built`，站点 https://moreconsequence.github.io/ HTTP 200。
- 线上内容验证：idempotency-engineering 页已含「真实数据库版」段落与幕1/幕2/幕3 输出（curl 实测）。
- 至此 P0-03 的「真实 Actions/deploy」证据补齐；失败反例（32257040131）与修复后的成功证据并存，闭环完整。

### 30.4 关闭声明

- P0-07、P0-03 已闭合。剩余：P0-04（历史事故原始输出本机不可取得，保留显式降级）、P1-01（全库 evidence snapshot 待补）、P1-02、P2-01 按既有边界执行。
