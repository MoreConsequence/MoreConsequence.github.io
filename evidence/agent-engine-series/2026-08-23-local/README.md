# evidence/agent-engine-series/2026-08-23-local

《Agent 的方方面面》系列（9 篇）源码数字复测记录。

## 背景

系列首篇（08-20）以 commit `5cd93f6` 为基线实测。2026-08-23 复测时本机 clone 已在
`b23741269`（2026-08-18），且 monorepo 结构漂移显著——按路线图规则 #2，
数字以本次复测为准并在各篇文中注明双基线。

## 环境

- 本机 clone：`~/codes/pi` @ `b23741269`（2026-08-18）
- token 计数：tiktoken `cl100k_base`（复用 `experiments/llm-token-economics/node_modules`）
- 工具：`experiments/llm-token-economics/count-system-prompt.mjs`（本次新增）

## 关键复测结果（measure.log 全量）

| 项 | 5cd93f6 基线 | b23741269 复测 |
| --- | --- | --- |
| agent 包 LOC | 12,635 | **15,280** |
| ai 包 LOC | 23,555 | **30,870** |
| coding-agent 包 LOC | 59,900 | **87,470** |
| tui 包 LOC | 16,772 | **19,841** |
| telemetry 包 LOC | 935 | 935（未变） |
| 新增目录 | — | client 1,592 / evals 1,311 / protocol 15,154 / server 5,124 / session-backends 2,566 / storage 220 |
| agent-loop.ts | 796 行，while@170/174 | **805 行**，while@170/174（未变） |
| system-prompt.ts tokens | 1288 字符 ≈ 322 tokens（粗估） | 整文件 1415；**去注释主体 1197 tokens** |

未变项：bash.ts 510 / read.ts 358 / edit.ts 461 / write.ts 274 / bash-executor.ts 156 /
exec.ts 107 / truncate.ts DEFAULT_MAX_BYTES@行12 / providers 47 个 / provider-retry.ts 125 /
overflow.ts 180 / extensions.md 3001 / permission-gate.ts 34 / sessions.md 145 /
session-format.md 438。微变：compaction.md 416→418；storage.ts 锚点行号平移
（publishFileAtomically 24→33，torn-tail 86→84）；resource-loader candidates 19→71。

## 边界

- 口径为"排除 *.test.ts/*.spec.ts 的 .ts 行数"，与首篇口径一致；
- token 计数用 cl100k_base，不代表各厂商真实 tokenizer；
- "79 个示例"沿用官方口径，顶层 `.ts` 实数 69，子目录示例未逐一枚举。
