# k8s-svc-net：iptables 线性匹配 vs IPVS/eBPF 哈希直查的实验入口

对应博客《Service 不是转发是线性遍历：iptables 规则链 vs eBPF O(1)》的
【本机实测待补】数字来源。两条路径：

| 路径 | 文件 | 成本 | 验证程度 |
| --- | --- | --- | --- |
| 模拟规则匹配次数（首选） | `rule-match-sim.go` | 秒级 | 本机可复现，已验证可运行 |
| 真集群 iptables vs IPVS 对照 | `kind-bench.sh` | 需 docker+kind，分钟~小时级 | 按前置条件执行 |

## 路径一：rule-match-sim.go —— 规则匹配步数模型

```bash
cd experiments/k8s-svc-net && go run rule-match-sim.go
```

它把 iptables 的 datapath 抽象成两个线性扫描：外层 KUBE-SERVICES 链（每 Service
一条规则，平均遍历 N/2 条）+ 内层 KUBE-SVC-* 链（每 Endpoint 一条 statistic 规则，
平均遍历 E/2 条）；IPVS 抽象成一次哈希查表。输出两列：

- 平均匹配步数（iptables）：随 N 线性增长，N=1000、4 Endpoint 时约 500 步；
- 哈希直查步数（IPVS）：恒为 1。

**怎么回填正文**：把本机跑出的步数与 ns 计时贴到正文【本机实测待补】处。
计时是“本机一次结果”，绝对值随机器/内核版本变化，正文必须写明量级与运行环境，
只强调“线性 vs 常数”的相对形状，不当生产结论。

## 路径二：kind-bench.sh —— 真集群对照

```bash
N=200 ROUNDS=20 bash experiments/k8s-svc-net/kind-bench.sh all
```

流程：各建一个 `kubeProxyMode=iptables` 与 `ipvs` 的 kind 单节点集群（已移除
控制面 taint）→ 一个 3 副本 echo 后端 → N 个 ClusterIP Service（各自独占
ClusterIP、服务端口统一 9000）→ 用 curl 容器逐轮打全部 ClusterIP，打印每轮总
毫秒与 req/s。iptables 模式还会打印 datapath 里真实 `KUBE-SVC-` 规则数，
与模型 `N*(E+2)` 量级对照。

- 前置条件：docker、kind ≥ v0.18、磁盘 8G+；先跑 `kind get clusters` 确认无残留。
- CPU 对比：博客早期版本用 `kubectl top node` 抓节点 CPU，kind 默认不装
  metrics-server，取不到时用 `kubectl top node` 报错属正常；本脚本已不依赖它，
  以每轮总延迟为主指标。要抓 CPU 可自行装 metrics-server 后加 `--kubelet-insecure-tls`。
- 诚实边界：kind 单节点把控制面也当数据面，NodePort/外网路径没覆盖；
  “打 ClusterIP”是东-西向流量，看不到 eBPF 相对 iptables 在 NodePort/南北向
  上的最大差距。想量化那条差距应上云厂商托管集群或真机多节点，属“生产/在线验证”
  级别，本文不声称做过。

## 博客正文待回填清单

1. 【本机实测待补：rule-match-sim.go 的步数与 ns 表】
2. 【本机实测待补：kind-bench.sh 每轮 ms/req/s 两列】
3. 回填时给每处数字注明：机器（CPU/内核 uname -r）、kind 版本、N/ROUNDS、单次或多取中位数。
