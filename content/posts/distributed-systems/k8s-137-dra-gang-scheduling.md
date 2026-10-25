---
title: "K8s 1.37：DRA 转正与 gang 调度的 Beta 入场券"
description: "Kubernetes 1.37 将动态资源分配 DRA 晋升为 GA，并将 PodGroup all-or-nothing 调度推进至 Beta。深入拆解拓扑感知调度、资源死锁规避与落地迁移清单。"
publishedAt: "2026-09-19"
tags: ["Kubernetes", "调度", "GPU", "分布式系统", "AI工程化"]
draft: false
featured: false
series: "系统设计手记"
---

**TL;DR：** Kubernetes 1.37 引入了两个重构异构计算调度的核心特性。第一，Dynamic Resource Allocation (DRA) 正式晋升 GA，彻底替代旧版 Device Plugin 标量计数的粗粒度模型，直接支持 NUMA、PCIe 与 NVLink 拓扑感知。第二，`Workload` 与 `PodGroup` 的 all-or-nothing (gang) 调度进入 Beta，受 `GenericWorkload` 特性门控控制且默认关闭。本文系统剖析 DRA 结构化参数模型、分布式 AI 训练死锁的根本成因、PodGroup 调度状态机，以及从 Device Plugin 平滑迁移至 DRA 的工程落地清单。

## 一、问题背景：为什么传统 GPU 调度无法支撑现代大模型训练

在 Kubernetes 1.37 之前，异构硬件（如 GPU、RDMA 网卡、TPU）的管理长期依赖 Device Plugin API。这一机制存在三个无法克服的架构瓶颈：

```text
传统 Device Plugin 标量计数与黑盒分配瓶颈：
+------------------------------------------------------------------------+
| Pod 声明: resources.limits["nvidia.com/gpu"] = 4                      |
+------------------------------------------------------------------------+
                                   |
                                   v
+------------------------------------------------------------------------+
| kube-scheduler 仅做整数加减运算 (Node GPU 剩余 8 - 4 = 4)             |
| 无法感知物理链路拓扑 (无法区分同 NUMA / NVLink 互联 与 跨 Socket PCIe)  |
+------------------------------------------------------------------------+
                                   |
                                   v
+------------------------------------------------------------------------+
| kubelet 触发 Device Plugin Allocate() 随机返回 4 张卡                   |
| 结果: GPU 0, 1 (NUMA Node 0) 与 GPU 6, 7 (NUMA Node 1) 被拼凑给同一 Pod |
| 跨插槽带宽骤降 75%，分布式 AllReduce 环路通信发生严重时延抖动           |
+------------------------------------------------------------------------+
```

1. **纯标量计数的表达力缺失**：Device Plugin 只能向 API Server 暴露整数标量（例如 `nvidia.com/gpu: 8`）。调度器在过滤节点时仅执行加减法，无法感知 GPU 之间的 NVLink 点对点拓扑、PCIe 交换机树状结构，也无法与 NUMA 亲和性对齐。
2. **分配决策与调度决策分离**：调度器选定节点时不知道最终会分到哪几张具体的卡；具体硬件的选择推迟到节点 kubelet 调用插件的 `Allocate()` RPC。这种晚期绑定经常导致同一个多卡训练任务分配到了跨 NUMA 甚至跨 PCIe 根复合体的卡，导致跨卡通信带宽暴跌。
3. **缺乏原子化组调度（Gang Scheduling）**：分布式训练（如 PyTorch DDP、Megatron-LM、DeepSpeed）要求 $N$ 个 Worker 同时启动并建立 TCP/RDMA 集合通信环路。如果集群并发提交多个作业，每个作业各自抢到了一部分 Pod 并占据 GPU，整个集群将陷入经典的分布式资源死锁（Deadlock），所有作业无限期卡在初始化握手阶段。

## 二、架构演进：DRA 核心对象与结构化参数

Kubernetes 1.37 GA 的 DRA 改变了设备分配的抽象模型，在 `resource.k8s.io/v1` 中引入了声明式资源生命周期管理：

```text
DRA (Dynamic Resource Allocation) 核心对象交互流：
+-----------------------------+
|    DeviceClass              | <----+ 平台管理员定义 (例如: "h100-nvlink-mesh")
+-----------------------------+      |
               |                     |
               v                     | references
+-----------------------------+      |
| ResourceClaimTemplate       | -----+
| (内嵌于 Job / Pod 规格)     |
+-----------------------------+
               | Controller 实例化
               v
+-----------------------------+
| ResourceClaim               | <----+ 调度器评估 CEL 匹配与拓扑评分
| - Structured Parameters     |      | Node 驱动上报 ResourceSlice
| - AllocationResult          |      |
+-----------------------------+      |
               |                     |
               +---------------------+
```

### 1. 结构化参数（Structured Parameters）与 ResourceSlice

在 DRA GA 规范中，驱动程序通过 `ResourceSlice` CRD 向集群发布节点的硬件库存及互联拓扑。调度器内部运行内置的 CEL（Common Expression Language）求值器，无需调用外部 Webhook 即可就地完成拓扑最优解计算：

```yaml
apiVersion: resource.k8s.io/v1
kind: DeviceClass
metadata:
  name: h100-nvlink-mesh
spec:
  selectors:
    - cel:
        expression: device.driver == "gpu.nvidia.com" && device.attributes["model"].string == "H100"
    - cel:
        expression: device.capacity["memory"].quantity >= quantity("80Gi")
```

### 2. Pod 内嵌声明式 ResourceClaimTemplate

应用通过声明 ResourceClaimTemplate 来表达对整组互联拓扑的诉求，调度器在调度期间直接计算设备约束：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: distributed-training-worker
spec:
  replicas: 4
  template:
    spec:
      resourceClaims:
        - name: gpu-group
          resourceClaimTemplateName: h100-four-gang
      containers:
        - name: trainer
          image: pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime
          resources:
            claims:
              - name: gpu-group
---
apiVersion: resource.k8s.io/v1
kind: ResourceClaimTemplate
metadata:
  name: h100-four-gang
spec:
  spec:
    devices:
      requests:
        - name: all-gpus
          deviceClassName: h100-nvlink-mesh
          count: 4
          allocationMode: ExactCount
          selectors:
            - cel:
                expression: device.attributes["nvlink_peers_count"].int >= 3
```

## 三、原生 Gang 调度：PodGroup 与 GenericWorkload 状态机

在 1.37 之前，用户必须部署第三方的 Volcano 或 Kubernetes SIGs 的 Coscheduling 调度器插件。1.37 将 `Workload` 与 `PodGroup` 概念收录为原生规范，由内置调度框架的 `Permit` 与 `Reserve` 阶段直接驱动。

```text
PodGroup 调度器生命周期与原子性保护：
[Job 提交 N 个 Pod]
       |
       v
+--------------------+      未达到 minMember 且超时
| PreFilter / Filter | ------------------------------+
+--------------------+                               |
       |                                             |
       v                                             |
+--------------------+                               |
| Reserve & Permit   |                               |
| 暂挂 (Wait on Gate)|                               |
+--------------------+                               v
       |                               +---------------------------+
       +--- 达到 minMember 要求 ------> | Permit 放行               |
                                       | 所有 Pod 原子性 Binding   |
                                       +---------------------------+
                                                     |
                                                     v
                                       +---------------------------+
                                       | Reject & Unreserve 回退   |
                                       | 释放所有占用的 GPU 配额   |
                                       +---------------------------+
```

### 1. 核心调度状态机

1. **PreFilter 汇总聚合**：调度器检测到 Pod 携带了 `workload.k8s.io/podgroup` 标签，首先核对该组当前已就绪的 Pod 总量。
2. **Permit 阶段拦截暂挂**：每一个通过 Filter/Score 的 Pod 在进入 Binding 阶段前被 `Permit` 插件挂起，进入等待队列（Wait-Queue），最大等待时间由 `scheduleTimeoutSeconds` 控制（例如 60 秒）。
3. **仲裁释放**：
   - 若在超时时间内，属于该 PodGroup 的 Pod 调度成功数量达到了 `minMember`，Permit 插件立即唤醒所有暂挂 Pod，原子性分发给各节点 kubelet 执行绑定。
   - 若发生超时，调度器触发 `Reject`，自动回退（Unreserve）该 PodGroup 中所有已暂挂 Pod 所占用的节点配额与 DRA 设备锁，避免死锁扩散。

### 2. 原生 PodGroup 声明规范

```yaml
apiVersion: workload.k8s.io/v1alpha3
kind: PodGroup
metadata:
  name: train-llama3-70b-job-01
  namespace: ml-platform
spec:
  minMember: 16
  scheduleTimeoutSeconds: 120
  priorityClassName: high-priority-preemptible
```

## 四、经典故障与死锁根因剖析

在多租户训练集群中，未启用 Gang 调度的资源互锁（Resource Interlocking）表现为典型的无进展活锁：

| 故障场景 | 传统 Device Plugin 行为 | K8s 1.37 DRA + PodGroup 行为 | 根因与规避机制 |
| --- | --- | --- | --- |
| 资源死锁 (Deadlock) | Job A 占 4 卡等 4 卡，Job B 占 4 卡等 4 卡，均无限阻塞 | 未凑齐 8 卡前互不独占，超时后主动退让释放卡 | Permit 阶段的 `minMember` 判定与超时自动回滚 |
| 拓扑性能倒挂 | 任务随机分到跨 NUMA 的 GPU，吞吐下降 60% | 调度器根据 `ResourceSlice` 计算拓扑亲和，不符则拒绝调度 | CEL 规则约束与驱动层结构化参数声明 |
| 驱动热升级震荡 | 节点升级时插件断连，运行中任务大面积被误杀 | DRA Claim 保持状态稳定，驱动重启不影响已分配 Claim | 资源声明与底层执行引擎生命周期解耦 |
| 碎片化饿死 (Starvation) | 小任务（1 卡）持续插入，大任务（8 卡）永远凑不齐 | PodGroup 结合抢占策略实现配额预留 | 组调度器排队感知，禁止低优先级小 Pod 持续插队 |

## 五、迁移与落地清单

由于 1.37 中的 Gang 调度目前仍处于 Beta 且默认处于关闭状态（受到 `GenericWorkload` 门控保护），生产落地应当遵循渐进式验证原则：

```yaml
# 1. 在 Control Plane kube-apiserver 与 kube-scheduler 启用特性门控
apiServer:
  extraArgs:
    feature-gates: "GenericWorkload=true,DynamicResourceAllocation=true"
scheduler:
  extraArgs:
    feature-gates: "GenericWorkload=true,DynamicResourceAllocation=true"
```

### 生产灰度实施四步法

1. **第一阶段：基建层 DRA 驱动部署**：在 GPU 节点安装支持 DRA v1 规范的硬件驱动插件，确认各节点生成有效的 `ResourceSlice` 资源。
2. **第二阶段：Staging 隔离集群门控验证**：在非核心集群开启 `GenericWorkload=true`，通过 Synthetic PyTorch 任务注入跨节点任务，验证超时回收逻辑与资源退还时效。
3. **第三阶段：CI/CD 模板由 Device Plugin 迁移至 ResourceClaimTemplate**：废除业务侧硬编码的 `resources.limits["nvidia.com/gpu"]`，平滑切换为结构化参数的 `resourceClaims`。
4. **第四阶段：监控埋点接入**：观测核心指标 `scheduler_pod_group_scheduling_duration_seconds` 以及 `scheduler_pod_group_unschedulable_total`，设置组调度超时告警。

## 六、证据卡与不可外推边界

| 维度 | 规范与实证边界 |
| --- | --- |
| 协议规范版本 | Kubernetes v1.37.0（DRA GA，PodGroup / GenericWorkload Beta） |
| 适用场景 | 仅适用于多卡/多节点集合通信型分布式任务，单副本无状态 Web 服务无需启用 |
| 性能与开销 | 调度器在内存中直接执行 CEL 求值，对比外部 Webhook 性能提升约 8 到 12 倍 |
| 不可外推边界 | 本文所述基于 upstream 1.37 规范语义与官方架构设计；不背书未经验证的第三方发行版定制调度器 |

## 参考资料

- Kubernetes 1.37 Release Announcement: <https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/>
- Kubernetes DRA Documentation: <https://kubernetes.io/docs/concepts/scheduling-eviction/dynamic-resource-allocation/>
- Kubernetes Enhancement Proposal (KEP-3063): Dynamic Resource Allocation GA.
- Kubernetes Enhancement Proposal (KEP-4402): Workload-aware gang scheduling.
- 站内关联：[Kubernetes 调度器资源账本](/writing/k8s-scheduler-resource-ledger)
