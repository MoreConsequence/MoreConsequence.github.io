"use client";

import React, { useState, useRef, useEffect } from "react";
import { Terminal, Copy, Check, Sparkles, RefreshCw } from "lucide-react";

interface TerminalHistoryItem {
  command: string;
  output: React.ReactNode;
  time: string;
}

const K8S_NODES_OUTPUT = (
  <div className="term-output">
    <div className="term-row term-table-head">
      <span>NAME</span>
      <span>STATUS</span>
      <span>ROLES</span>
      <span>AGE</span>
      <span>VERSION</span>
      <span>INTERNAL-IP</span>
      <span>OS-IMAGE</span>
    </div>
    <div className="term-row">
      <span className="term-cyan">k8s-control-plane-01</span>
      <span className="term-green">Ready</span>
      <span className="term-yellow">control-plane</span>
      <span>42d</span>
      <span>v1.31.0</span>
      <span>10.244.0.10</span>
      <span>Ubuntu 24.04 LTS</span>
    </div>
    <div className="term-row">
      <span className="term-cyan">k8s-gpu-worker-01</span>
      <span className="term-green">Ready</span>
      <span className="term-blue">worker,gpu</span>
      <span>18d</span>
      <span>v1.31.0</span>
      <span>10.244.1.24</span>
      <span>Ubuntu 24.04 LTS</span>
    </div>
    <div className="term-row">
      <span className="term-cyan">k8s-gpu-worker-02</span>
      <span className="term-green">Ready</span>
      <span className="term-blue">worker,gpu</span>
      <span>18d</span>
      <span>v1.31.0</span>
      <span>10.244.1.25</span>
      <span>Ubuntu 24.04 LTS</span>
    </div>
    <div className="term-row">
      <span className="term-cyan">k8s-storage-worker-01</span>
      <span className="term-green">Ready</span>
      <span className="term-purple">storage</span>
      <span>29d</span>
      <span>v1.31.0</span>
      <span>10.244.2.11</span>
      <span>Ubuntu 24.04 LTS</span>
    </div>
  </div>
);

const K8S_PODS_OUTPUT = (
  <div className="term-output">
    <div className="term-row term-table-head">
      <span>NAMESPACE</span>
      <span>NAME</span>
      <span>READY</span>
      <span>STATUS</span>
      <span>RESTARTS</span>
      <span>AGE</span>
      <span>NODE</span>
    </div>
    <div className="term-row">
      <span className="term-purple">kube-system</span>
      <span>cilium-ebpf-agent-m4kx9</span>
      <span>1/1</span>
      <span className="term-green">Running</span>
      <span>0</span>
      <span>42d</span>
      <span>k8s-control-plane-01</span>
    </div>
    <div className="term-row">
      <span className="term-purple">ai-inference</span>
      <span className="term-cyan">deepseek-v3-worker-0</span>
      <span>2/2</span>
      <span className="term-green">Running</span>
      <span>0</span>
      <span>4h12m</span>
      <span>k8s-gpu-worker-01</span>
    </div>
    <div className="term-row">
      <span className="term-purple">ai-inference</span>
      <span className="term-cyan">deepseek-v3-worker-1</span>
      <span>2/2</span>
      <span className="term-green">Running</span>
      <span>0</span>
      <span>4h12m</span>
      <span>k8s-gpu-worker-02</span>
    </div>
    <div className="term-row">
      <span className="term-purple">storage-system</span>
      <span>rook-ceph-operator-7c8bf</span>
      <span>1/1</span>
      <span className="term-green">Running</span>
      <span>0</span>
      <span>29d</span>
      <span>k8s-storage-worker-01</span>
    </div>
    <div className="term-row">
      <span className="term-purple">storage-system</span>
      <span>csi-rbdplugin-provisioner-0</span>
      <span>6/6</span>
      <span className="term-green">Running</span>
      <span>0</span>
      <span>29d</span>
      <span>k8s-storage-worker-01</span>
    </div>
  </div>
);

const K8S_DESCRIBE_OUTPUT = (
  <div className="term-output term-pre-block">
    <span className="term-yellow">Name:</span> deepseek-v3-worker-0{'\n'}
    <span className="term-yellow">Namespace:</span> ai-inference{'\n'}
    <span className="term-yellow">Priority:</span> 1000000 (system-node-critical){'\n'}
    <span className="term-yellow">Node:</span> k8s-gpu-worker-01/10.244.1.24{'\n'}
    <span className="term-yellow">Labels:</span> app=vllm-engine, model=deepseek-v3, ray.io/node-type=worker{'\n'}
    <span className="term-yellow">Status:</span> <span className="term-green">Running</span>{'\n'}
    <span className="term-yellow">IP:</span> 10.244.1.88{'\n'}
    <span className="term-yellow">Containers:</span>{'\n'}
    {'  '}<span className="term-cyan">vllm-worker:</span>{'\n'}
    {'    '}Container ID: containerd://94f27ca38e02d84719b218408c1{'\n'}
    {'    '}Image: vllm/vllm-openai:v0.6.3{'\n'}
    {'    '}Port: 8000/TCP{'\n'}
    {'    '}Limits:{'\n'}
    {'      '}nvidia.com/gpu: 8{'\n'}
    {'      '}memory: 640Gi{'\n'}
    {'    '}Environment:{'\n'}
    {'      '}RAY_NODE_IP: (v1:status.podIP){'\n'}
    {'      '}VLLM_ATTENTION_BACKEND: FLASHINFER{'\n'}
    <span className="term-yellow">Volumes:</span>{'\n'}
    {'  '}<span className="term-cyan">model-cache-pvc:</span> Type=PersistentVolumeClaim (claimName=deepseek-weights-pvc){'\n'}
    <span className="term-yellow">Events:</span>{'\n'}
    {'  '}Type    Reason     Age    From               Message{'\n'}
    {'  '}----    ------     ----   ----               -------{'\n'}
    {'  '}Normal  Scheduled  4h12m  default-scheduler  Successfully assigned ai-inference/deepseek-v3-worker-0 to k8s-gpu-worker-01{'\n'}
    {'  '}Normal  Pulled     4h11m  kubelet            Container image &quot;vllm/vllm-openai:v0.6.3&quot; already present on machine{'\n'}
    {'  '}Normal  Created    4h11m  kubelet            Created container vllm-worker{'\n'}
    {'  '}Normal  Started    4h11m  kubelet            Started container vllm-worker
  </div>
);

const BPFTOOL_OUTPUT = (
  <div className="term-output">
    <div className="term-row term-table-head">
      <span>PROG ID</span>
      <span>TYPE</span>
      <span>NAME</span>
      <span>TAG</span>
      <span>LOADED</span>
      <span>ATTACHED</span>
    </div>
    <div className="term-row">
      <span>14</span>
      <span className="term-green">sched_cls</span>
      <span className="term-cyan">bbr_pacing_filter</span>
      <span>4a8f9011de3b</span>
      <span>2026-09-29T10:00</span>
      <span>eth0:tc_ingress</span>
    </div>
    <div className="term-row">
      <span>28</span>
      <span className="term-green">xdp</span>
      <span className="term-cyan">xdp_cilium_fast_lb</span>
      <span>8702b801a2cc</span>
      <span>2026-09-29T10:00</span>
      <span>eth0:xdp</span>
    </div>
    <div className="term-row">
      <span>63</span>
      <span className="term-green">tracepoint</span>
      <span className="term-cyan">sched_switch_probe</span>
      <span>11bc76e82a90</span>
      <span>2026-09-29T10:00</span>
      <span>sched:sched_switch</span>
    </div>
  </div>
);

const CRICTL_OUTPUT = (
  <div className="term-output">
    <div className="term-row term-table-head">
      <span>POD ID</span>
      <span>CREATED</span>
      <span>STATE</span>
      <span>NAME</span>
      <span>NAMESPACE</span>
      <span>ATTEMPT</span>
    </div>
    <div className="term-row">
      <span>d4e92b810f3a</span>
      <span>4 hours ago</span>
      <span className="term-green">Ready</span>
      <span className="term-cyan">deepseek-v3-worker-0</span>
      <span>ai-inference</span>
      <span>0</span>
    </div>
    <div className="term-row">
      <span>b1940fa2c918</span>
      <span>42 days ago</span>
      <span className="term-green">Ready</span>
      <span className="term-cyan">cilium-ebpf-agent-m4kx9</span>
      <span>kube-system</span>
      <span>0</span>
    </div>
  </div>
);

const HELP_OUTPUT = (
  <div className="term-output term-pre-block">
    <span className="term-green">Boundary Notes · 云原生交互式内核终端</span>{'\n\n'}
    支持的仿真命令列表：{'\n'}
    {'  '}<span className="term-cyan">kubectl get nodes</span>        - 探查集群节点拓扑、状态与运行时{'\n'}
    {'  '}<span className="term-cyan">kubectl get pods -A</span>        - 查询全命名空间工作负载状态{'\n'}
    {'  '}<span className="term-cyan">kubectl describe pod &lt;name&gt;</span> - 深度诊断 Pod 资源限制、挂载卷与调度事件{'\n'}
    {'  '}<span className="term-cyan">crictl pods</span>                - 检查 Containerd 容器运行时沙箱状态{'\n'}
    {'  '}<span className="term-cyan">bpftool prog list</span>          - 观测 Linux 内核挂载的 eBPF 探针与调度过滤器{'\n'}
    {'  '}<span className="term-cyan">uname -a</span>                  - 查看宿主机 Linux 内核版本与 SMP 架构{'\n'}
    {'  '}<span className="term-cyan">clear</span>                     - 清空当前终端屏幕{'\n'}
    {'  '}<span className="term-cyan">help</span>                      - 打印本帮助说明
  </div>
);

export function getCommandOutput(cmd: string): React.ReactNode {
  const trimmed = cmd.trim();
  if (trimmed === "help") {
    return HELP_OUTPUT;
  }
  if (trimmed === "kubectl get nodes" || trimmed.startsWith("kubectl get node")) {
    return K8S_NODES_OUTPUT;
  }
  if (trimmed === "kubectl get pods -A" || trimmed === "kubectl get pods" || trimmed.startsWith("kubectl get pod")) {
    return K8S_PODS_OUTPUT;
  }
  if (trimmed.startsWith("kubectl describe pod")) {
    return K8S_DESCRIBE_OUTPUT;
  }
  if (trimmed === "bpftool prog list" || trimmed === "bpftool prog") {
    return BPFTOOL_OUTPUT;
  }
  if (trimmed === "crictl pods" || trimmed.startsWith("crictl")) {
    return CRICTL_OUTPUT;
  }
  if (trimmed === "uname -a" || trimmed === "uname") {
    return (
      <div className="term-output">
        Linux k8s-control-plane-01 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux
      </div>
    );
  }
  if (trimmed === "free -h" || trimmed === "free") {
    return (
      <div className="term-output term-pre-block">
        {'               '}total        used        free      shared  buff/cache   available{'\n'}
        Mem:           125Gi        32Gi        78Gi       1.2Gi        15Gi        91Gi{'\n'}
        Swap:            0B          0B          0B
      </div>
    );
  }
  if (trimmed.startsWith("curl ")) {
    return (
      <div className="term-output term-pre-block">
        <span className="term-green">HTTP/2 200 OK</span>{'\n'}
        <span className="term-cyan">date:</span> {new Date().toUTCString()}{'\n'}
        <span className="term-cyan">content-type:</span> application/json; charset=utf-8{'\n'}
        <span className="term-cyan">x-envoy-upstream-service-time:</span> 1.82ms{'\n'}
        <span className="term-cyan">server:</span> envoy-ai-gateway/v1.31{'\n\n'}
        {JSON.stringify({ status: "healthy", cluster: "production-k8s", paged_kv_cache: "enabled" }, null, 2)}
      </div>
    );
  }
  if (trimmed.startsWith("cat ")) {
    const target = trimmed.slice(4).trim();
    return (
      <div className="term-output term-pre-block">
        <span className="term-yellow"># Content of {target}</span>{'\n'}
        vm.max_map_count = 262144{'\n'}
        net.core.somaxconn = 65535{'\n'}
        net.ipv4.tcp_max_syn_backlog = 16384{'\n'}
        fs.file-max = 2097152
      </div>
    );
  }
  if (trimmed === "docker ps" || trimmed.startsWith("docker ps")) {
    return (
      <div className="term-output term-pre-block">
        CONTAINER ID   IMAGE                         COMMAND                  CREATED         STATUS         PORTS     NAMES{'\n'}
        a1b2c3d4e5f6   vllm/vllm-openai:latest       &quot;python3 -m vllm.en…&quot;   2 hours ago     Up 2 hours               vllm-inference{'\n'}
        f7e8d9c0b1a2   envoyproxy/envoy:v1.31-latest &quot;/docker-entrypoint…&quot;   5 days ago      Up 5 days                ai-gateway
      </div>
    );
  }
  if (trimmed.startsWith("echo ")) {
    return <div className="term-output">{trimmed.slice(5)}</div>;
  }
  return (
    <div className="term-output term-error">
      bash: {trimmed.split(" ")[0]}: command simulated. Type &apos;help&apos; for cluster commands.
    </div>
  );
}

export function WebTerminal({
  initialCommand = "kubectl get nodes",
  title = "dev@k8s-node-01: ~",
  className = "",
}: {
  initialCommand?: string;
  title?: string;
  className?: string;
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<TerminalHistoryItem[]>(() => {
    const items: TerminalHistoryItem[] = [
      {
        command: "uname -a",
        output: (
          <div className="term-output">
            Linux k8s-control-plane-01 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux
          </div>
        ),
        time: "08:00:01",
      },
    ];
    if (initialCommand && initialCommand !== "uname -a") {
      items.push({
        command: initialCommand,
        output: getCommandOutput(initialCommand),
        time: "08:00:02",
      });
    }
    return items;
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const time = new Date().toLocaleTimeString();

    if (trimmed === "clear") {
      setHistory([]);
      setInput("");
      return;
    }

    const output = getCommandOutput(trimmed);

    setHistory((prev) => [...prev, { command: trimmed, output, time }]);
    setInput("");
    setHistoryIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]?.command || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setInput("");
      } else {
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]?.command || "");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const available = [
        "kubectl get nodes",
        "kubectl get pods -A",
        "kubectl describe pod deepseek-v3-worker-0",
        "bpftool prog list",
        "crictl pods",
        "uname -a",
        "clear",
        "help",
      ];
      const match = available.find((c) => c.startsWith(input));
      if (match) setInput(match);
    } else if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      setInput("");
    } else if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      setHistory([]);
    }
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const copyTranscript = () => {
    const text = history
      .map((item) => `$ ${item.command}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const quickPills = [
    "kubectl get nodes",
    "kubectl get pods -A",
    "kubectl describe pod deepseek-v3-worker-0",
    "bpftool prog list",
    "crictl pods",
    "help",
  ];

  return (
    <div className={`web-terminal-wrapper ${className}`}>
      {/* 终端顶部操作栏 */}
      <div className="terminal-header">
        <div className="terminal-dots" aria-hidden="true">
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </div>
        <div className="terminal-title">
          <Terminal size={14} className="terminal-icon" />
          <span>{title}</span>
        </div>
        <div className="terminal-actions">
          <button
            type="button"
            className="term-action-btn"
            onClick={copyTranscript}
            title="复制已执行命令"
            aria-label="复制已执行命令"
          >
            {copied ? <Check size={14} className="term-green" /> : <Copy size={14} />}
          </button>
          <button
            type="button"
            className="term-action-btn"
            onClick={() => setHistory([])}
            title="清空终端 (Ctrl+L)"
            aria-label="清空终端"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 快捷点击执行指令栏 */}
      <div className="terminal-quick-bar" aria-label="快捷执行命令">
        <span className="quick-label">
          <Sparkles size={12} /> 快捷预设:
        </span>
        <div className="quick-chips">
          {quickPills.map((pill) => (
            <button
              key={pill}
              type="button"
              className="quick-chip"
              onClick={() => {
                executeCommand(pill);
                inputRef.current?.focus();
              }}
            >
              {pill}
            </button>
          ))}
        </div>
      </div>

      {/* 终端主体输出区 */}
      <div
        className="terminal-body"
        onClick={() => inputRef.current?.focus()}
      >
        {history.map((item, idx) => (
          <div key={idx} className="term-entry">
            <div className="term-prompt-line">
              <span className="term-user">dev@k8s</span>
              <span className="term-colon">:</span>
              <span className="term-path">~</span>
              <span className="term-dollar">$</span>
              <span className="term-command">{item.command}</span>
            </div>
            {item.output}
          </div>
        ))}

        {/* 当前交互行 */}
        <div className="term-active-line">
          <span className="term-user">dev@k8s</span>
          <span className="term-colon">:</span>
          <span className="term-path">~</span>
          <span className="term-dollar">$</span>
          <input
            ref={inputRef}
            type="text"
            className="term-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            autoComplete="off"
            aria-label="终端输入框"
          />
        </div>
        <div ref={terminalEndRef} />
      </div>

      {/* 终端底部状态栏 */}
      <div className="terminal-footer">
        <span>K8s v1.31.0 · Cilium eBPF · Containerd · 仿真沙盒</span>
        <span>支持 Tab 补全 · ↑↓ 翻阅历史 · clear 清屏</span>
      </div>
    </div>
  );
}
