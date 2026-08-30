---
title: "证据的保质期：一份跑对了却落盘坏了的实验报告"
description: "实验结论的可靠性不取决于当初跑得有多准，取决于落盘的那份原始输出是否真实、是否带着环境快照。2026-08-19 我修了库里的三处证据缺陷：一份全是编译错误的 run.out、两个声称有实测却从未落盘的 ns 数字、一堆与 raw 漂移 1MB 的内存指标。本文给出可运行的 `npm run audit:evidence` 检查器，用真实事故提炼六条保存纪律。"
publishedAt: "2026-08-19"
tags: ["证据工程", "工程实践", "性能", "可复现性"]
draft: true
featured: false
---

**TL;DR：** 实验报告的保质期由落盘决定，不由当初的严谨程度决定。一份跑对了的 benchmark，如果落盘时跑进错误目录、输出全是编译错误，它的结论就失去任何追溯能力；一篇声称"统一 benchmark 测得 7.4ns/14.6ns"的文章，如果原始输出从未保存，那两个数字就是无源的值。2026-08-19 我在这个仓库的真实证据里修掉了三处同类缺陷（损坏的 run.out、无源的原子/锁延迟、与 raw 漂移的内存指标），并把全库扫描固化成可执行检查器 `npm run audit:evidence`（`scripts/evidence-audit.mjs`）。检查器现在对 135 篇已发布文章做两层校验：硬检查引用路径与证据快照必须存在（当前 0 失败），软报告把文章带单位的数字与 raw 做模糊比对，只标出派生/换算可疑项。六条纪律在文末，全部由这三次事故反推出来。


---

![证据工程与可复现性链条：环境基准、原始输出落盘与不可篡改审计流](../../../public/images/evidence-engineering-reproducibility-chain.svg)

## 一、问题：证据的判决，看落盘不看跑动

证据工程的第一原则是反直觉的：**你跑得多准不影响结论的追溯能力，你落盘了什么才影响。** 一次实验哪怕流程完美，只要原始输出没有按可复现的方式保存，事后任何人都无法验证、无法重跑、无法对比——包括你自己。实验报告本质上是一份"当时发生了什么"的陈述，支撑它的不是记忆，不是口头承诺，是磁盘上那份 raw output：命令、版本、环境、输出文本。缺任何一项，数字就从"实测"退化成"声称"。

这个仓库从 2026-08-16 起给每篇实验文章配一份 `evidence/<slug>/<日期>/` 目录，内容约定为 environment.txt（环境快照）+ raw（原始输出）+ README（命令）。这套约定的价值本应在发布日就兑现，但实践下来发现它只约束了"目录存在"，没约束"内容真实"。本轮审计发现了三处内容层面的失效，它们的成因各不相同，但后果一致：文章里的数字无法追溯到任何真实运行。



![工程证据链闭环：不可变原始日志采集、哈希指纹存证与可复现验证矩阵](../../../public/images/evidence-chain-raw-log-audit-lifecycle.svg)

## 二、事故三幕：三个证据怎么失去作为证据的资格

### 2.1 坏掉的 run.out：跑对实验，落盘时漏进了错误目录

第一起事故最隐蔽。`content/posts/benchmark-one-variable.md`（对比预热 / 不预热 / 叠加 GC 堆压力三种配置的 min 统计）发布后，evidence 目录里躺着一份 `run.out`。打开看，整份输出是这样的：

```
round1
main module (leakdemo) does not contain package leakdemo/experiments/benchmark-one-variable
main module (leakdemo) does not contain package leakdemo/experiments/benchmark-one-variable
round2
main module (leakdemo) does not contain package leakdemo/experiments/benchmark-one-variable
```

这不是慢、不是噪声，是**跑进了错误的工作目录 / 模块**——`go run` 把目标的包路径拼进了别的 module 名，连编译都没过。文章正文却煞有介事地写了三档 min 表格（clean 1.100/1.006/1.014ms、noWarmup 1.144/1.046/1.042ms、withGc 0.971/0.948/0.982ms）和一个完整序列（"noWarmup 第 2 拍 +63%/+74%/+60%"）。这些数字大概率来自发布前某次真实运行的手抄，但**没有任何原始输出记录它们**——事后唯一可查的文件里写的是编译错误。于是文章的全部结论建立在无源数字上，直到重跑之前无人发现。

修复方式是重跑并重记：`cd experiments && go run ./benchmark-one-variable -mode clean|noWarmup|withGc` 连续三轮，每次记录五个样本。首轮复跑里 noWarmup 出现 11.3ms 的孤立尖峰——那是首次 `go run` 的编译与冷启动叠加污染，不属于实验语义。机器预热后的连续三轮结构才稳定：noWarmup 每轮第二次出现 1.637/1.638/1.763ms 的尖峰（相对首拍 +68%/+68%/+77%），withGc 的 min 稳定低于 clean（0.920–0.933ms vs 0.987–0.991ms，约快 6%）。文章按这组真实样本修订：min 表改为 0.991/0.988/0.987、0.975/0.973/0.996、0.924/0.933/0.920ms，完整序列与尖峰比例同步更新，`run.out` 用真实记录重写。**教训 1：落盘必须用与结论同一次运行的原始输出，重跑只能得到"另一份样本"，不能给旧结论补证据。**

### 2.2 无源的原子与锁延迟：数字在文章里，原始输出从未存在

第二起事故更隐蔽：一篇讲 `atomic` 与 Mutex 成本的文章（`go-atomic-vs-mutex.md`）宣称"统一 benchmark（Go 1.25.1/Darwin arm64）测得：单线程 atomic.Add 约 7.4ns、Mutex 约 14.6ns"，第五节的选型依据也沿用这两个数。但翻遍 `evidence/go-runtime-boundary/2026-08-16-local/raw/` 的证据文件（contention.txt 等），只有「2/4/8/16 个 worker 的竞争曲线」，**单线程无竞争基线从未落盘**。`bench_test.go` 里确实有 `BenchmarkAtomicAdd` 与 `BenchmarkMutexLockUnlock` 两个单线程函数，但发布时没人运行并保存它们——文章的 7.4/14.6 是"记得的值"，不是"记录的值"。

复跑并落盘（`go test -bench='BenchmarkAtomicAdd|BenchmarkMutexLockUnlock' -benchtime=2s -count=3`）得到的真实样本：atomic 9.4~14.4ns（两次运行共 6 个样本，中位约 10ns）、Mutex 18.4~29.5ns（中位约 19~25ns）。与文章声称的 7.4/14.6 明显不同。修订原则：既然结论依赖「无竞争 vs 竞争」的对比结构而非精确比特，数字改为实测区间 `9–14ns` / `18–30ns`，并注明中位数，`atomic-mutex.txt` 落进 evidence。**教训 2：凡在正文出现的性能数字，都要能指向保存下来的那一行 raw；否则它只是记忆。** 之前仓库另有三篇文章（outbox 复用延迟、jwt 校验、秒杀扣减）也是同一病理——文章数字与 evidence 漂移，全部按 evidence 修订过。

### 2.3 漂移的内存指标：raw 也在，只是换了数值

第三起是 "raw 存在但数字不一致"：`memory-metrics-rss-heapused.md` 的四阶段内存快照表格引用 evidence 目录，而 2026-08-19 的复跑输出（`heap-objs-version.out`）里 GC 后是 RSS 59.4MB / heapUsed 4.4MB / heapTotal 133.3MB，文章却写 60.1/4.5/133.8MB；Buffer 对照表 247.4MB 写成了 248.1MB。原始输出并不短缺——缺的是"发布时用与文章数字同一次运行的文件收档"。堆水位这类量随进程初始状态、GC 调度和系统负载浮动，一次复跑和另一次之间差 1~2MB 完全正常，所以问题不是"复跑不稳定"，而是"文章没有与任何一次保存的输出对齐"。修复如表 1，全部对齐 08-19 复跑记录，并注明 updatedAt。

| 阶段 | RSS | heapUsed | heapTotal |
| :--- | ---: | ---: | ---: |
| 启动后 | 44.3MB | 3.6MB | 5.3MB |
| 堆内 200MB（引用中） | 211.3MB | 156.3MB | 285.9MB |
| 释放引用，未 GC | 211.3MB | 156.3MB | 285.9MB |
| **GC 之后** | **59.4MB** | **4.4MB** | 133.3MB |
| 再分配 100MB（复用堆） | 136.1MB | 80.7MB | 209.9MB |

三起事故有个共同点：**发布流程校验了"evidence 目录存在、文章引用了正确路径"，却没人校验"文章数字 = raw 输出"**。目录存在让你以为证据健全，正文数字却可能来自另一时刻。下面把这对校验补进自动化。

## 三、全库体检：把校验做成能跑的脚本

把教训固化成工具，而不是靠人肉回头翻文件。`scripts/evidence-audit.mjs` 对 `content/posts/` 的每一篇已发布文章做两层检查：

1. **硬检查（失败即 exit 1）**：正文里每个 `evidence/<slug>` / `experiments/<dir>` 引用必须真实存在于仓库，且 evidence 目录必须含带日期的快照版本 + 至少一个 raw 文件。当前全库 135 篇，这项 0 失败。
2. **软报告（列出可疑，不阻塞）**：提取正文里所有带单位的数字（`nn.nns`、`nn.nn%`、`nn.nnMB` 等），与对应 evidence 的全部 raw 文本做模糊比对（含 µs↔ms 换算、3 位小数容差），命中不到就列为 DRIFT。这层是候选清单——数字可能是派生值（如 2512150 B 换算成 2.51MB）或来自引用的公开事实，需要人工判定，但它的价值是把"查证据"从全库十小时缩到"看工具输出 + 抽查几个 candidate"。

运行方式：`npm run audit:evidence`。它现在把这个库的审校方式固化下来，任何新文章发布后立刻能查：本文的正文数字也都通过它核对（见复现一节）。

工具本身也暴露了一些早期误报，都很值得讲：`experiments/go.mod` 这种文件引用会被当成目录（修正是解析引用时跳过带扩展名的文件路径段）；`experiments/sse-vs-ws/evidence/2026-08-16-local` 这种"实验内嵌证据"被当成站内 evidence 路径（修正是匹配整体引用串并识别内嵌的 `evidence/` 段）。这提醒我们：**自动检查器的价值不在第一次跑就完美，在于把'检查'变成一次可重跑的命令，而不是每次手搓正则。**



![工程信任金字塔：从口头声称到生产回放日志的可信度阶梯](../../../public/images/evidence-engineering-pyramid-trust-model.svg)

## 四、六个检查，等于六个承诺

* **跑前先建目录：** 实验命令跑出第一行输出前，先建好 `evidence/<slug>/<日期>/raw/`、`environment.txt`（日期、checkout、机器、OS、运行时版本、命令），避免事后才想起"当时什么环境"。本仓库 `environment.txt` 的 `checkout=` 字段允许记录 dirty 状态，但更提倡在发布提交前保存干净 checkout。
* **落盘用同一次运行：** 结论引用的每个数字，必须是保存下来的那次运行打印的；重跑只能作为"新样本"补充，不能给旧结论补证据（事故 2.1 的反面）。
* **一个数字一行出处：** 正文每个带单位的数字在 evidence 里都要能找到一个位置；找不到就删掉或改成不带精确值的量级描述（事故 2.2 的反面）。
* **数字对齐 raw 而非记忆：** 发文前把表格数字和 evidence 再对一遍，用脚本做模糊比对，而不是目测（事故 2.3 的反面）。
* **保存环境快照与命令：** 环境变了数字就浮动（这台 M1 上同一天两轮 atomic bench 从 9.4 漂到 14.4ns），缺 env 快照的 raw 无法复现。
* **把检查变成命令：** 审查规则写进 `scripts/`，`npm run audit:evidence` 可重复执行；不用就落灰，用了就持续暴露。

## 五、边界：什么算证据，什么不算

这套检查能抓住的是"数字与 raw 的对应关系"，它管不到三件事：

1. **raw 本身可以造假或走样：** 检查只保证"文章数字≈这份文件"，不保证"这份文件来自真实运行"。本仓库的 benchmark 事故正是反例——文件是坏的，程序不会替你发现。
2. **单机数字不是语义证明：** 哪怕 benchmark 完美落盘，它也只在"当前机器 / 当前版本 / 当前输入"下成立；不能外推为协议语义、生产 p99 或跨平台常数。这是所有文章都声明的边界，检查器不额外处理。
3. **退化的证据链无法凭工具重建：** 如果连原文都找不到，工具只能标"缺失"，修不回来。所以保存的时机在发布前，不在审计时。

检查器对 135 篇的软报告里仍有 11 个候选值需要人工判断（如 2512150 B 换算 2.51MB、3009ns/100 的每项均值 30.1ns 等派生值），这些是"数字存在于 raw、只是单位/换算不同"的合法情况——软报告的功能就是让你点开看，而不是替你下结论。

## 六、结论：保质期的起点在落盘那一刻

证据的保质期不是从"跑"开始计的，是从"落盘"开始计的。跑错了可以重跑，落盘错了一旦发文再难回头。把"结论数字 ≈ 落盘 raw"变成发布流程的硬校验，是本次三起事故最大的实际收益——它把一篇关于证据的文章本身变成证据：本文引用的每个数字都过了 `npm run audit:evidence`，而工具的命令与实现就是你复现这一切的入口。下一步可执行的事：对你的下一篇实验文章，先建 evidence 目录再写代码；发完跑一次 `npm run audit:evidence`，看到 HARD 列空、DRIFT 列表你逐条能解释，才算完。

## 参考资料

- 事故现场：`evidence/benchmark-one-variable/2026-08-19-local/`（修复后的 run.out 记录 3 轮 × 3 mode 共 9 组样本，损坏的旧文件记录于 `review.md` 第 37.1 节）
- `review.md` 第 37.2 节：memory-metrics 数字漂移的修订。
- `review.md` 第 31 节：P1-01 全库 evidence 扫描（5 篇缺失落盘 + 3 篇数字漂移修订）。
- Go 单线程基线（事故二）：`go test -bench='BenchmarkAtomicAdd|BenchmarkMutexLockUnlock' -benchtime=2s -count=3`，输出在 `evidence/go-runtime-boundary/2026-08-16-local/raw/atomic-mutex.txt`。