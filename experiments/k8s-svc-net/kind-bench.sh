#!/usr/bin/env bash
# kind-bench.sh — 真集群对照：同负载下 iptables vs IPVS 模式的每轮总延迟
#
# 对应博客《Service 不是转发是线性遍历》的“真集群”实验：在 kind 集群里造 N 个
# ClusterIP Service（共享同一批后端 Pod，但每个 Service 独占一个 ClusterIP，
# 也就是独占一组 NAT 规则），用 curl 逐包打全部 ClusterIP，比较两种 proxy 模式。
#
# 前置条件：本机有 docker 与 kind（kind ≥ v0.18，支持 kubeProxyMode），磁盘 8G+。
# 这是比 rule-match-sim.go 重得多的真集群路径；sim 是轻量、稳定可复现的首选。
#
# 用法：
#   N=200 ROUNDS=20 bash experiments/k8s-svc-net/kind-bench.sh iptables
#   N=200 ROUNDS=20 bash experiments/k8s-svc-net/kind-bench.sh ipvs
#   N=200 ROUNDS=20 bash experiments/k8s-svc-net/kind-bench.sh all   # 两个都跑
#
# 结果怎么读：ROUNDS 轮每轮总毫秒数，iptables 模式应随 N 明显劣化、IPVS 基本持平；
# 单次运行只是“本机一次结果”，想当结论请固定 N、多跑几次取中位数，
# 并记录 kind / 内核版本（uname -r 与 kubectl version 是必须附的）。
set -euo pipefail

MODE="${1:-all}"
N="${N:-200}"
ROUNDS="${ROUNDS:-20}"

kind_create() { # $1=cluster名 $2=iptables|ipvs
  local name="$1" mode="$2"
  if kind get clusters 2>/dev/null | grep -q "^${name}$"; then
    echo "[skip] ${name} 已存在"
    return 0
  fi
  cat > "/tmp/kind-${name}.yaml" <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  kubeProxyMode: ${mode}
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    apiVersion: kubeadm.k8s.io/v1beta3
    kind: InitConfiguration
    nodeRegistration:
      taints: []          # 允许在控制面节点调度测试 Pod
EOF
  kind create cluster --name "${name}" --config "/tmp/kind-${name}.yaml"
}

bench() { # $1=cluster名 $2=模式名
  local name="$1" label="$2"
  local ctx="kind-${name}"
  kind_create "$name" "$label"
  kubectl --context "$ctx" rollout status ds -n kube-system kube-proxy --timeout=120s >/dev/null 2>&1 || true

  # 1) 一个 echo 后端（3 副本），供 N 个 Service 共享 → 每 Service 3 个 Endpoint
  kubectl --context "$ctx" create deployment echoserver \
    --image=registry.k8s.io/echoserver:1.10 --replicas=3 2>/dev/null || true
  kubectl --context "$ctx" rollout status deployment/echoserver --timeout=120s >/dev/null 2>&1

  # 2) 造 N 个 ClusterIP Service：各自独占 ClusterIP，服务端口统一 9000，
  #    都转发到后端 8080。每个 Service = 1 条 KUBE-SERVICES 规则 + 1 条 SVC 链 + 3 条 SEP 链。
  local svc_manifest="/tmp/svcs-${name}.yaml"
  : > "$svc_manifest"
  for ((i=1;i<=N;i++)); do
    cat >> "$svc_manifest" <<EOF
apiVersion: v1
kind: Service
metadata:
  name: svc-${i}
  labels: {t: bench}
spec:
  selector: {app: echoserver}
  ports:
  - {port: 9000, targetPort: 8080}
---
EOF
  done
  kubectl --context "$ctx" apply -f "$svc_manifest" >/dev/null
  sleep 12   # 给 kube-proxy 时间把规则刷进内核（iptables 模式规则量大）

  # 3) 统计 datapath 里真实规则数（与 rule-match-sim.go 的 N*endpoints 量级对照）
  if [ "$label" = "iptables" ]; then
    local rules
    rules=$(kubectl --context "$ctx" -n kube-system exec ds/kube-proxy -- \
      iptables-save 2>/dev/null | grep -c 'KUBE-SVC-' || true)
    echo "iptables 规则总数(KUBE-SVC- 计数): ${rules:-取不到(见下)}"
    kubectl --context "$ctx" -n kube-system logs ds/kube-proxy --tail=5 >/dev/null 2>&1 || true
  fi

  # 4) 打负载：逐轮把 N 个 ClusterIP 各打一遍，记每轮总毫秒（吞吐= N / 每轮秒）
  local ips
  ips=$(kubectl --context "$ctx" get svc -l t=bench -o jsonpath='{.items[*].spec.clusterIP}')
  local loadgen="loadgen-${name}"
  kubectl --context "$ctx" delete pod "$loadgen" --ignore-not-found=true >/dev/null 2>&1
  kubectl --context "$ctx" run "$loadgen" --image=curlimages/curl --restart=Never \
    --command -- /bin/sh -c 'sleep 3600' >/dev/null 2>&1
  kubectl --context "$ctx" wait --for=condition=Ready pod/"$loadgen" --timeout=120s >/dev/null 2>&1

  echo "== ${label} 模式：N=${N} Service，${ROUNDS} 轮，每轮 ${N} 个包 =="
  kubectl --context "$ctx" exec "$loadgen" -- /bin/sh -c "
for r in \$(seq 1 ${ROUNDS}); do
  start=\$(date +%s%N)
  for ip in \$(shuf -e ${ips}); do
    curl -s -o /dev/null --max-time 2 http://\${ip}:9000/ || true
  done
  end=\$(date +%s%N)
  ms=\$(( (end-start)/1000000 ))
  echo \"round \$r: \${ms} ms/round  (\$(( ${N} * 1000 / \${ms} )) req/s)\"
done
"
  kubectl --context "$ctx" delete pod "$loadgen" --ignore-not-found=true >/dev/null 2>&1 || true
}

case "$MODE" in
  iptables) bench kind-iptables iptables ;;
  ipvs)     bench kind-ipvs     ipvs ;;
  all)
    bench kind-iptables iptables
    bench kind-ipvs     ipvs
    ;;
  *) echo "用法: $0 [iptables|ipvs|all]"; exit 1 ;;
esac
