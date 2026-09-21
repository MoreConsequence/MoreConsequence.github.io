---
title: "配置热加载：解析全成功才换引用，50 次风暴写入无半截读"
description: "读解析全成功才原子替换引用：v1→v2 热加载，坏文件保持旧版并计数，50 次好坏交替写入读到的永远是合法版本。用 4 断言锁定无锁读写的正确形状。"
publishedAt: "2026-09-14"
tags: ["系统设计", "配置", "可靠性", "Node.js"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 配置热加载的正确形状只有一句话：读 + 解析全成功才换引用。v1→v2 生效，坏文件 `poll` 失败但继续服务 v2（`errors=1`），50 次好坏交替写入后读到的全是合法版本（`final=148`）。4 断言全过。单线程下引用替换天然原子——多线程/多进程才需要文件锁或版本号，这一区别必须写进注释。

## 一、合同

| 场景 | 行为 | 调用者负责 |
| --- | --- | --- |
| 正常更新 | 解析成功即换 | 监听/轮询触发 |
| 坏文件 | 保持旧版 + 计数 | 告警看 errors |
| 并发读写 | 单线程引用替换原子 | 多进程加锁或原子改名 |

## 二、实测

`experiments/config-reload/reload.mjs`（系统临时目录，不污染仓库），`evidence/config-reload/2026-09-14-local/run.out`，4 PASS。

## 三、K8s 侧的同构陷阱

挂载的 ConfigMap 会自动更新，但延迟 = kubelet sync 周期（默认 1min）+ 本地缓存 TTL（默认 1min）；三类**永不**更新：`subPath` 挂载（bind-mount 锁死 inode，官方文档定性为已知限制）、环境变量、immutable 标记后反悔（只能删了重建）。应用侧同样要“会看”：启动时读一次的进程永远看不见变更——轮询或 watch 缺一不可。对照本文实验：`poll()` 即应用侧的“会看”，目录挂载即 K8s 侧的“会给”，两边缺一边热加载都不成立。

```js
// 实验核心（experiments/config-reload/reload.mjs）：解析成功才换引用
poll() {
  try {
    const next = this.load(); // 全量解析成功才换引用
    this.current = next;
    return true;
  } catch { this.errors++; return false; }
}
```

## 四、证据卡与边界

环境 Node v24.19.0。不支持：多进程共享、fs.watch 跨平台语义、配置 schema 校验。

## 参考资料

- K8s ConfigMap（配置热挂载的生产形态），<https://kubernetes.io/docs/concepts/configuration/configmap/>；挂载更新语义与 subPath 限制，<https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/>（2026-09-20 核对）
- 前篇：发布检查清单（配置门禁上下文），`/writing/service-release-checklist`；CI/CD 门禁，`/writing/service-ci-cd`
