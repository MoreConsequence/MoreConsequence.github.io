---
title: "Node 权限模型：能拦住投毒依赖读文件，拦不住什么"
description: "Node --permission 把 fs/子进程收进白名单：/tmp 放行、/etc 读写与 spawn 一律 ERR_ACCESS_DENIED，无 flag 则默认全放行。用 7 个断言验证拦截边界，并说明允许路径内作恶与逻辑漏洞为何不在射程内。"
publishedAt: "2026-09-14"
tags: ["TypeScript", "Node.js", "安全", "Go 对照"]
draft: false
featured: false
series: "从 Go 到 TypeScript"
---

**TL;DR：** Node 用 `--permission --allow-fs-read=/tmp --allow-fs-write=/tmp` 启动后，读 `/etc/hosts`、写 `/etc`、起子进程全部被 `ERR_ACCESS_DENIED` 拦下，而 `/tmp` 内读写与 `os.hostname()` 照常放行；无 flag 时默认全放行。7 个断言全部通过（Node v24.19.0）。但权限模型只管“能不能碰”，不管“碰了干什么”——允许路径内的数据外带、逻辑漏洞与恶意原生模块都不在射程内，它是纵深的一层，不是沙箱。

## 一、完整路径：一次越权读取被拦在哪里

```text
node --permission --allow-fs-read=/tmp 启动
  → require('fs').readFileSync('/tmp/x') → 放行
  → readFileSync('/etc/hosts') → ERR_ACCESS_DENIED（调用前检查）
  → child_process.execSync → ERR_ACCESS_DENIED（整类能力关闭）
  → os.hostname() → 放行（非管控面）
```

检查发生在能力调用点，不是事后审计——被拦的调用直接抛错，业务代码必须自己接住并降级。

## 二、合同：权限模型保证什么、不保证什么

| 维度 | 保证 | 不保证 | 调用者仍负责 |
| --- | --- | --- | --- |
| 文件 | 白名单外读写一律拒绝 | 白名单内的文件是“好”的（/tmp 投毒照样读） | 白名单最小化、敏感文件远离允许路径 |
| 子进程 | 默认整类关闭 | 关闭后业务还能起 worker（需显式放行） | 按需 `--allow-child-process`，命令参数仍要校验 |
| 网络 | 可按 host 限（另配） | 已允许目标的数据语义 | 出站审计与 Secret 不进允许路径 |
| 供应链 | 拦住“读文件/起进程”两类 payload | 逻辑后门、挖矿（纯 CPU）、数据外带 | 锁文件审计、行为监控、最小依赖 |
| 默认值 | 显式开启即生效 | 默认开启（无 flag 全放行，P1 对照） | 启动脚本必须带 flag，CI 校验 flag 存在 |

P1 对照组是最重要的一行：**无 flag 默认全放行**。权限模型是 opt-in，漏配等于没有。

## 三、实测：7 个断言

探针 `experiments/node-permission-boundary/probe.cjs`，门脚本同目录 `run.sh`（目录无关，仓库根与实验目录双跑全绿），原始输出 `evidence/node-permission-boundary/2026-09-14-local/run.out`。

```text
PASS P1 无 flag 默认全放行
PASS P2 允许读放行
PASS P3 /etc 读被拦
PASS P4 允许写放行
PASS P5 /etc 写被拦
PASS P6 子进程被拦
PASS P7 非管控面放行
ALL CHECKS PASSED
```

## 四、Go 对照：一句话

Go 没有等价的进程内权限模型——Go 程序的文件与进程能力由 OS 用户、容器 seccomp/capabilities 与部署策略约束。Node 把这一层收进运行时，代价是每个被拦点都要业务代码显式处理错误；收益是投毒依赖的 blast radius 从“整机”缩到“白名单”。两种路线不分高下，但**混用时不要 double-free 式重复设防，也不要两边都漏**。

## 五、证据卡与边界

| 字段 | 内容 |
| --- | --- |
| 问题 | 权限模型拦截哪些能力、默认行为是什么？ |
| 环境 | Darwin arm64，Node v24.19.0，零依赖 |
| 输入 | 6 类操作 × 有/无 flag，确定性运行 |
| 原始输出 | `evidence/node-permission-boundary/2026-09-14-local/run.out`（7 PASS） |
| 支持结论 | 白名单外读写与 spawn 被拦、默认全放行、非管控面放行 |
| 不支持结论 | 网络 host 限、worker 线程约束、生产依赖投毒真实案例、性能开销 |

## 六、结论：先给启动脚本加 flag，再谈纵深

回到开头：权限模型拦的是“碰不该碰的东西”，拦不住“碰了之后使坏”。行动清单两行：生产启动命令加上 `--permission` 与最小白名单，并在 CI 里断言 flag 存在（防回退）；然后继续做锁文件审计与出站监控——权限模型是第一道门，不是整栋房子。

## 参考资料

- Node.js 官方文档：Permission Model（以本地 v24.19.0 实测行为为准，版本差异按目标版本重测），<https://nodejs.org/api/permissions.html>（2026-09-14 核对）
