# evidence/evidence-audit/2026-08-23-local

证据链体检工具（`experiments/evidence-audit/audit.mjs`）对本仓库全部证据目录的首次全量运行。

## 环境

- darwin/arm64，Node v24.19.0，无第三方依赖
- 工具：`experiments/evidence-audit/audit.mjs`

## 运行命令

```sh
node experiments/evidence-audit/audit.mjs   # 从仓库任意目录运行，路径锚定脚本自身
```

## 文件清单

- `v1-table-env-regex-bug.md`：第一版工具的输出。env 判定正则缺 `i` 标志，
  把写作 `Node v24.19.0` 的记录误判为缺失：PASS 只有 21。保留作为"审计者也要被审计"的原始反例。
- `v2-audit-table.md`：修正正则后的全量快照：91 个目录，PASS 23（25.3%）。
  本目录自身当时仍 GAP：命名带 `-first-run` 后缀破坏回溯，且 `.md` 数据表未计为原始输出。
- `v3-selfcheck-naming-miss.md`：自举检查的失败现场（工具自己的行：trace=MISS、rawFiles=0）。
- `v4-final-table.md`：修正命名与计数规则后的最终快照：**91 个目录，PASS 24（26.4%），
  缺环境 54、缺命令块 42、无原始文件 1、slug 无法回溯 5**；工具自身的目录转为 PASS。

## 边界

- 体检只检查合同字段的**在场性**（有没有记录），不验证内容正确性；
- env/command 判定是启发式正则，存在漏报可能（宁漏报勿误报方向设计）；
- 抽查确认 GAP 是真问题：如 `evidence/go-context-vs-abortsignal/2026-08-19-local/`
  有 `run.log`/`run.out` 但无 README——原始输出在、合同不在。
