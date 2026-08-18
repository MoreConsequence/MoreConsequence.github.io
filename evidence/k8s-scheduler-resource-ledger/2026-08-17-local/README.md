# k8s-scheduler-resource-ledger evidence

这是一个固定输入的 Kubernetes scheduler 资源计分教学模型，不是 kube-scheduler、kind 集群或生产调度 benchmark。

## 命令

从仓库根目录运行：

```bash
python3 experiments/k8s-scheduler-boundary/schedule_model.py
```

模型固定四个 8 CPU / 16 GiB 节点，待调度 Pod 请求 1 CPU / 2 GiB，分别计算 LeastAllocated、MostAllocated、BalancedAllocation，并按 Kubernetes v1.33 `numFeasibleNodesToFind` 的抽样公式打印示例。

## 解释边界

- 资源分数只复现文章展示的三条公式；没有实现 scheduler framework、插件权重合并、过滤插件、抢占、拓扑约束或真实 node state。
- 抽样公式绑定到文章引用的 Kubernetes v1.33 源码快照；目标集群的版本、SchedulerConfiguration 和发行版可能不同。
- raw 输出只支持四节点教学表和取样算术，不证明任何集群的 Pod 落点、调度延迟、容量或可用性。

原始输出见 `raw/schedule_model.txt`，环境见 `environment.txt`。
