import type { Metadata } from "next";
import Link from "next/link";
import { WebTerminal } from "@/components/sandboxes/web-terminal";

export const metadata: Metadata = {
  title: "云原生与内核交互式 Web 终端 (K8s & Linux Shell) | 交互式实验室",
  description: "免后端的纯客户端云原生终端沙盒：实操演练 kubectl 集群探查、crictl 容器运行时排查、eBPF 内核探测与 Linux 系统调度命令。",
};

export default function TerminalPlaygroundPage() {
  return (
    <div className="playground-page">
      <div className="mb-6">
        <Link href="/playground" className="playground-section-sublink">
          ← 返回实验室总览
        </Link>
        <h1 className="playground-title" style={{ marginTop: "0.5rem" }}>
          💻 云原生与内核交互式 Web 终端 (K8s & Linux Shell)
        </h1>
        <p className="playground-desc" style={{ marginTop: "0.5rem", color: "var(--muted)" }}>
          免后端、纯客户端运行的仿 Linux 命令行沙盒。实操演练集群拓扑探查、大模型工作负载诊断、Cilium eBPF 探针观测与容器运行时状态机。
        </p>
      </div>
      <WebTerminal />
    </div>
  );
}
