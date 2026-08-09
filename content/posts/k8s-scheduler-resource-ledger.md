---
title: "K8s 调度器不是找最空的机器：filter 与 score 的两轮筛选"
description: "调度器不'选最优'，它只做两件事：先用 filter 把不合格的节点拒掉，再对剩下的打分——而且打分阶段可能根本不全量。用源码公式复查（LeastAllocated/MostAllocated/BalancedAllocation 的权重与计分），再跑一个 Go 模拟：四个节点、三种打分策略，赢家各不相同。附抽样逻辑：为什么节点一多，分数最高的那台未必参与打分。"
publishedAt: "2026-08-10"
updatedAt: "2026-08-10"
tags: ["Kubernetes", "调度", "kube-scheduler", "性能"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** 调度器不是"找最合适的节点"，而是两轮筛选：**filter 先砍掉不合格的（硬约束），score 再给剩下的按加权算分（软偏好）**。三个反直觉点：**filter 阶段只按 requests 记账，不看真实用量**（"requests 是调度账、limits 是运行时账"）；**score 阶段不是必须全量打分**——节点超过 100 台后按 `50 - n/125`（最低 5%）抽样，只对抽到的台打分；**同分节点之间用抽签（reservoir sampling）**，没有任何"就近"或稳定性保证。所以"调度结果忽东忽西"多半不是玄学：不是没打分换台机器，就是抽签抽到了另一台。

## 一、先说直觉错在哪：调度没有"最优"这一说

几乎所有 K8s 入门文章都会把调度形容成"给 Pod 找一台合适的机器"。正确的心智模型是三步的：

```text
排队（PrioritySort）→ 找合格节点（filter）→ 给合格节点打分（score）→ 挑分数最高的（同分抽签）
```

关键在一个词：**合格（feasible）**。调度器根本不管"这台机器真实负载是多少"，它只知道"账面上还有多少 requests 可分配"。所以调度质量问题要分两层看：**能不能放得下（硬约束，filter）**和**放哪里更好（软偏好，score）**。前者错就是排不进去（`Insufficient cpu`），后者错只是选得不漂亮——且没人定义过什么叫"漂亮"。

## 二、filter：否决权在谁手上

得分前先过 filter。默认配置（v1 `default_plugins.go`）里负责资源的 filter 是 `NodeResourcesFit`，规则简单到可以直接贴源码公式：

```go
// fit.go — 每个资源维度的硬检查
if podRequest.MilliCPU > (nodeInfo.Allocatable.MilliCPU - nodeInfo.Requested.MilliCPU) {
    return Unschedulable // "Insufficient cpu"
}
if podRequest.Memory > (nodeInfo.Allocatable.Memory - nodeInfo.Requested.Memory) {
    return Unschedulable // "Insufficient memory"
}
```

两个细节值得注意：

1. **对比的是 allocatable 减去 already-requested，不是减去实际用量**。节点上跑的容器真实吃了 70% CPU，只要账面上只剩 100m 空闲，500m 的 pod 就进不去——这条账保护的是"承诺"不是"现实"。
2. **没写 requests 的容器会给默认值**：CPU 按 `DefaultMilliCPURequest = 100`（0.1 核）、内存按 `DefaultMemoryRequest = 200 × 1024 × 1024` 计——因为如果不计，调度器会无差别堆 pod，堆到 kubelet 端再靠 cgroup 打架。这是默认值替你买的"保险"。

filter 是多插件并行跑的（`parallelize.Until`），一个节点只要有一个 filter 说不，就出局，**不出局的节点才进入打分**。这个检查列表还包括 `NodePorts`（hostPort 冲突）、`VolumeBinding`（PVC 可否绑定）、`TaintToleration` 的硬版（required 污点必须有 toleration）——这些全是"一票否决"。

## 三、score：默认权重与三分公式

分是**多把尺子加权**。v1.33 的默认权重（`default_plugins.go`）：

| 插件 | 默认权重 | 它偏好的"好" |
| --- | --- | --- |
| TaintToleration | 3 | 容忍该节点污点的得高分 |
| PodTopologySpread | 2 | 同类 pod 尽量摊开 |
| InterPodAffinity | 2 | 亲和/反亲和软规则 |
| NodeAffinity | 2 | preferred 亲和 |
| NodeResourcesFit | 1 | 资源余量（默认 LeastAllocated） |
| NodeResourcesBalancedAllocation | 1 | CPU 与内存占用比例均衡 |
| ImageLocality | 1 | 节点上已有镜像 |

其中跟资源相关的是 `NodeResourcesFit`（默认 LeastAllocated：**越空越好**）和 BalancedAllocation（**CPU 和内存占用率别一边倒**）。公式在 `pkg/scheduler/framework/plugins/noderesources/` 下，我按源码逐行抄了个可运行的 Go 对照实现（四个 8C/16G 节点，新 Pod 请求 1C/2GiB）：

```go
// least:       ((capacity-requested)*100)/capacity，CPU/内存加权平均
// most:        (requested*100)/capacity              （装箱策略）
// balanced:    (1 - |cpu占比-内存占比|/2) * 100      （均衡策略）
```

四个节点"已占用 requests / 容量"（核 / GiB）：

- `n1`：4核/4G —— CPU 吃一半，内存松
- `n2`：2核/12G —— CPU 松，内存被吃满
- `n3`：7核/6G —— CPU 接近满，内存中等
- `n4`：3核/8G —— 两项都中等

实测打分（Go 实现，本机运行）：

```text
node least   most    balanced  说明
n1   49      49      87         CPU 松、内存松 → least 爱它
n2   37      62      75         若塞得进，most 认为它"划算"
n3   25      75      75         装箱（最接近满）的最佳选择
n4   43      56      93         CPU/内存平衡得最好
```

三种策略选出的赢家分别是 **n1（least）/ n3（most）/ n4（balanced）**——同一个集群同一种负载，只改打分策略，Pod 掉到三台不同的机器上。**这不是"哪个对"，而是"你偏好哪种形态"**：

| 策略 | 它保证什么 | 代价 |
| --- | --- | --- |
| LeastAllocated（默认） | 负载摊得比较开 | 集群整体利用率低、碎片多 |
| MostAllocated（装箱） | 高利用率、节点少 | 单点过载风险、互相挤兑 |
| BalancedAllocation | CPU 与内存比例匀称 | 单一维度负载场景收益有限 |

`NodeResourcesFit` 默认 LeastAllocated，MostAllocated 需要 SchedulerConfiguration 显式配置（参考[资源装箱官方文档](https://kubernetes.io/docs/concepts/scheduling-eviction/resource-bin-packing/)）。成本敏感的集群才值得切。

## 四、两个反直觉细节：打分不全量、同分靠抽签

**反直觉 1：score 阶段未必给所有可行节点打分。** `schedule_one.go` 里的 `numFeasibleNodesToFind`：

```go
// 节点总数 < 100：全打
// 否则：percentage = 50 - n/125，最低 5%
// 打分台数 = n * percentage / 100，且不低于 100 台
```

于是：200 台集群 → 约 49%（98 台，不足 100 补到 100）进打分；1000 台 → 42% 进；5000 台 → 10%（500 台）进。**剩下的可行节点连分数都没有。**"分数最高"其实只是"抽到的那些节点里的最高分"——cluster 越大，这个"最优"越名不副实。

**反直觉 2：同分靠 reservoir sampling。** 选完最高分组后，若有多个节点并列，用 reservoir：**每个同分节点按 1/k 概率替换当前选中者**。所以集群状态完全一样，连续两次调度同一个 pod，落点可能不同——**这是设计好的，不是随机 bug**。它让"最高分组"里每一台都有被选到的可能，避免永远押在同一台上（尤其当你有 3 台都想装的节点时）。

两个设计加在一起，调度链路其实是：

```text
队列 → filter（只剩可行节点）→ score 只看抽样组 → reservoir 抽签选 host → 异步 bind
```

## 五、对照实验的用法：怎么用这三把尺子

回到第四节那份 Go 仿真：给定任意节点起点与新请求，三把尺子会给不同赢家，这就是集群形态的杠杆。实操上你改的是 weights/strategy，而不是"调随机数"：

```bash
kubectl -n kube-system get cm kube-scheduler -o yaml   # 看当前权重
kubectl describe pod mypod                              # 看被拒原因
kubectl logs -n kube-system kube-scheduler-xxx --v=5     # 调度日志明细
```

改前问自己三问：

1. **是 filter 挡还是 score 输？** `describe` 里写 `Insufficient cpu` 是 filter；`FitError` 但没明细 → 看 `--v=5` 日志中的插件拒绝原因。
2. **想达成什么形态？** 论分布（least）、论装箱（most）、论匀称（balanced）。默认 least。
3. **同分抽签你介意吗？** 介意就加 `PodTopologySpread` 权重或 `nodeAffinity` 硬约束，把"唯一峰值"变成明确偏好，而不是赌随机。

## 结论

调度器把"一人一台"改成"两轮筛选 + 加权偏好"后，行为就可预测了：**filter 决定能不能调，score 决定调在哪**。摸清三件事就够用：

1. **filter 只认 requests**，别拿真实负载指责调度器；
2. **默认 least，大集群打分不同量**，别指望"最高分"是全局最优；
3. **抽签是特性不是 bug**，要确定性就上偏好约束，别赌随机。

下一步（2 分钟）：`kubectl describe pod` 找出你排不进去的 pod，看是哪个 filter 报的 `Insufficient`；如果卡在资源上，重点看那台节点的 requests 账是不是被占满。

## 参考资料

1. Scheduler Configuration（默认插件与权重）—— https://kubernetes.io/docs/reference/scheduling/config/
2. kube-scheduler 源码（filter/score 插件，含 `numFeasibleNodesToFind`、reservoir）—— https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/
3. Resource Bin Packing（MostAllocated 官方文档）—— https://kubernetes.io/docs/concepts/scheduling-eviction/resource-bin-packing/

> 延伸：调度是控制面 watch 循环的一环（[控制器与 watch 的增量账](/writing/k8s-controller-watch-etcd)）；调度结果落到节点后怎么优雅退（[Kubernetes 优雅终止](/writing/kubernetes-graceful-termination)）。