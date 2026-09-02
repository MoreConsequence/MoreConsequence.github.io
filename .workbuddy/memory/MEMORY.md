# 项目长期记忆

## 选题与证据等级（2026-09-01 用户纠正后确立）

**AGENTS.md §七/§八 的证据闸门不是"每篇都要本机可验"，而是"证据等级必须匹配声明等级"。**
曾误读为"选题必须先过本机可跑这一关"，被用户指出；纯理论文章（不可行性证明、公式推导、协议语义论证）完全合规，不需要 benchmark。

按声明类型配证据：

| 声明类型 | 需要的证据 | 不需要 |
| --- | --- | --- |
| 机制/协议语义/版本/默认值 | 一手来源（RFC、论文、官方器文档、源码）+ 时效性事实标核对日期 | 跑实验 |
| 数学推导/不可行性证明 | 推导自洽 + 引用原始论文 | 跑实验（跑也无意义） |
| 性能数字 | 环境、输入、预热、重复次数、分母、单位、影响变量 | — |
| 声称"生产就绪" | 真实部署/观测/回滚/故障验证 | 本地原型不能冒充 |

两条易忘的硬约束：
- **"单次本机结果不能写成稳定分界线"** —— 本机数字证据强度低于论文受控实验；不要把"本机可跑"当卖点。
- **拿不到可靠数字就删除性能断言或写清量级与假设，不编造"常见值"。**

**真正的底线是"不编造"，不是"能跑"。**

推论：纯理论文章因为少了实验兜底，对**引用与推导正确性**的要求更高（§八 第 1 条），是更费查证，不是更省事。

## 选题口味：用户强烈反对"教科书经典题"（2026-09-01）

用户多次否决过 CAP / FLP / 3f+1 / 法定人数证明 / 两将军 / 重试放大 / 队列论 /
GOGC 调优 / 隔离级别 这类"分布式系统博客标准目录"里的题，原话是"老掉了牙"。

**根因**：我一直在 pattern-match「一个分布式系统博客该写什么」，而不是「*这个*博客的独特资产是什么」。

**选题必须满足**之一：
- 反直觉 / 反共识结论（能让人停下来重想）
- 提出一个**新的分类维度或 mental model**，而不是复述既有知识
- 对一句人人皆知的箴言做**实质性升级**（不只是换个说法）
- 只有同时懂 A 和 B 两个领域的人才能写出来的**交叉**

查重覆盖面（已存在，别再提）：
- agent 侧：agent-engine-context / pi-tutorial-04-compaction-budget / dsh-05-llm-streaming-and-compaction /
  pi-advanced-02-subagents / agent-engine-economics / agent-engine-security → **上下文压缩、多智能体、成本、安全 均已覆盖**
- LLM 侧：kv-cache / continuous-batching / speculative-decoding / semantic-cache / MCP / evals / HNSW 均已覆盖

## 已存在文章查重（选题前必查，避免撞车）

- `core-principles/`：mesi-cache-coherence-false-sharing、socket-backpressure-slow-consumer、clock-skew-distributed-systems、epoll/select-poll、zero-copy-sendfile-io-uring、tcp-bbr、time-wait、virtual-memory-page-fault、quic、tls、dns-ttl、mini-lsm、context-switching、perf-flamegraph
- `database-storage/`：fsync-group-commit、wal-crash-recovery、mvcc-isolation-snapshot、btree-page-split、buffer-pool-lru、lsm-vs-btree、mysql-redo-undo-binlog
- `standalone/`：p99-sample-size-confidence、latency-attribution、histogram-bucket-design、benchmark-one-variable
- 全库 **0 篇**提到 coordinated omission（选题空白点）
- 65 篇提到"重试"但**无专门文章**（选题空白点）

## 图表工程（见 2026-08-31 / 2026-09-01 日志）

**HTML 是唯一编辑源**，SVG 是派生物，禁止手改 `public/images/`。

三步流水线，顺序不能反：

1. `python3 scripts/verify-diagram-strokes.py` —— 源(.html)必须先全绿
2. `python3 scripts/export-diagrams.py --changed` —— 确定性导出（新增脚本，取代手工拷贝）
3. `python3 scripts/verify-diagram-strokes.py public/images/<name>.svg` —— 产物复检
   + `~/.codex/skills/diagram-design/scripts/self_check.py <svg>`

### verify-diagram-strokes.py 覆盖的 5 类缺陷

| 检查 | 修复手法 |
| --- | --- |
| 描边粗细不在 {0.8 细, 1 默认, 1.2 强调连接线} | accent `#eb6c36` 的 line/path 必须 1.2，其余 1，淡色轴/容器 0.8 |
| 三个规范 marker 缺失或尺寸非 `8/6/refX=7/refY=3` | 补齐 defs |
| **悬空 `marker-start/end` 引用**（箭头根本没渲染出来） | 改成已定义的 `#arrow` / `#arrow-accent` / `#arrow-link` / `#arrow-ink` |
| 标签遮罩压到连接线（净空需 6–10px） | 移遮罩，别移线；遮罩底边与线距离 ≥6 |
| 遮罩切断节点框 | 遮罩必须完全落在框内 |

**历史坑（2026-09-01 修）**：该脚本早期只在 `<rect>` 上查 stroke-width，而 accent 1.2 全在
line/path 上 → 整类缺陷漏检；`path_segments` 只认 M/L，把 M/H/V 正交折线误判成曲线而跳过几何检查，
结果 TSO 图里竖线穿过标签文字却报"无法验证"。现在支持绝对 M/L/H/V/Q，Q 的控制点当拐角顶点（保守包络）。

**diagram-design skill 自带的 `self_check.py` 查不出悬空 marker 与遮罩压线**，这两类必须靠本仓库脚本。
