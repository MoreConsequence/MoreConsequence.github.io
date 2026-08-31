import type { Metadata } from "next";
import Link from "next/link";
import { LLMCalculator } from "@/components/sandboxes/llm-calculator";
import { RaftSimulator } from "@/components/sandboxes/raft-simulator";
import { VectorClockSimulator } from "@/components/sandboxes/vector-clock-simulator";
import { TCPacingSimulator } from "@/components/sandboxes/tc-pacing-simulator";

export const metadata: Metadata = {
  title: "交互式系统设计实验室",
  description: "面向资深工程师与架构师的交互式算法与工程沙盒：从 Raft 分布式选主模拟、LLM 显存吞吐实时测算，到向量时钟因果分叉与 Linux TC Pacing 流量调度。",
};

const SANDBOX_LIST = [
  {
    id: "llm-calc",
    icon: "🧮",
    title: "大模型显存容量与吞吐配平计算器",
    desc: "基于 PagedAttention 显存模型与物理硬件约束，实时测算静态权重、KV Cache 水位线与 GPU OOM 告警。",
    href: "/playground/llm-calculator",
    relatedArticle: "/writing/llm-01-kv-cache-paged-attention",
    relatedTitle: "大模型显存墙与内存虚拟化：KV Cache 物理开销与 PagedAttention 底层原理",
  },
  {
    id: "raft-sim",
    icon: "🏛️",
    title: "Raft 分布式集群与网络分区模拟器",
    desc: "5 节点动态集群状态机，实操检验非对称网络分区下 Pre-Vote 如何防御脑裂与任期暴涨。",
    href: "/playground/raft-simulator",
    relatedArticle: "/writing/consensus-01-raft-state-machine-replication",
    relatedTitle: "深入 Raft 共识内核：Leader 选举状态机、日志复制与物理脑裂防御",
  },
  {
    id: "vector-clock",
    icon: "🧭",
    title: "向量时钟因果分叉与冲突判定沙盒",
    desc: "三节点时空生命线，交互式演示 Happens-Before 因果先后与并发分支冲突（V_A ∥ V_B）判定。",
    href: "/playground/vector-clock",
    relatedArticle: "/writing/consensus-04-logical-clocks-vector-spanner-truetime",
    relatedTitle: "分布式时序与因果一致性：Lamport 逻辑时钟、向量时钟到 Spanner TrueTime",
  },
  {
    id: "tc-pacing",
    icon: "🎛️",
    title: "Linux TC 流量控制与 BBR/fq Pacing 模拟器",
    desc: "对比传统 pfifo_fast 突发拥塞与 Fair Queueing (fq) 纳秒级匀速发包对 Bufferbloat 排队延迟的消除。",
    href: "/playground/tc-pacing",
    relatedArticle: "/writing/kernel-05-tc-bbr-qdisc-traffic-shaping",
    relatedTitle: "Linux 流量控制（TC）与拥塞调度：qdisc 排队规则、HTB 分层令牌桶与 BBR 联动",
  },
];

export default function PlaygroundPage() {
  return (
    <div className="playground-page">
      {/* Hero Header */}
      <div className="playground-hero">
        <div className="playground-badge">
          <span>✨</span> Interactive Engineering Labs
        </div>
        <h1 className="playground-title">
          交互式系统设计实验室
        </h1>
        <p className="playground-desc">
          突破静态图文边界。在这里，你可以直接在浏览器中滑动参数、注入网络故障、把玩分布式状态机与显存/网络调度内核。
        </p>
      </div>

      {/* Sandbox Cards Nav */}
      <div className="playground-grid">
        {SANDBOX_LIST.map((box) => (
          <div key={box.id} className="playground-card">
            <div>
              <div className="playground-card-header">
                <span className="playground-card-icon">
                  {box.icon}
                </span>
                <h2 className="playground-card-title">
                  {box.title}
                </h2>
              </div>
              <p className="playground-card-desc">
                {box.desc}
              </p>
            </div>

            <div className="playground-card-footer">
              <Link
                href={box.relatedArticle}
                className="playground-card-link"
                title={box.relatedTitle}
              >
                📖 专栏对应文章
              </Link>
              <a
                href={`#${box.id}`}
                className="playground-card-action"
              >
                向下直达把玩 ↓
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Sandbox 1: LLM Calculator */}
      <section id="llm-calc" className="playground-section">
        <div className="playground-section-header">
          <div className="playground-section-title-wrap">
            <span>🧮</span>
            <h2 className="playground-section-title">
              1. 大模型显存容量与吞吐配平计算器
            </h2>
          </div>
          <Link
            href="/writing/llm-01-kv-cache-paged-attention"
            className="playground-section-sublink"
          >
            查看原理解析 ──►
          </Link>
        </div>
        <LLMCalculator />
      </section>

      {/* Sandbox 2: Raft Simulator */}
      <section id="raft-sim" className="playground-section">
        <div className="playground-section-header">
          <div className="playground-section-title-wrap">
            <span>🏛️</span>
            <h2 className="playground-section-title">
              2. Raft 分布式集群与网络分区模拟器
            </h2>
          </div>
          <Link
            href="/writing/consensus-01-raft-state-machine-replication"
            className="playground-section-sublink"
          >
            查看原理解析 ──►
          </Link>
        </div>
        <RaftSimulator />
      </section>

      {/* Sandbox 3: Vector Clock */}
      <section id="vector-clock" className="playground-section">
        <div className="playground-section-header">
          <div className="playground-section-title-wrap">
            <span>🧭</span>
            <h2 className="playground-section-title">
              3. 向量时钟因果分叉与冲突判定沙盒
            </h2>
          </div>
          <Link
            href="/writing/consensus-04-logical-clocks-vector-spanner-truetime"
            className="playground-section-sublink"
          >
            查看原理解析 ──►
          </Link>
        </div>
        <VectorClockSimulator />
      </section>

      {/* Sandbox 4: Linux TC Pacing */}
      <section id="tc-pacing" className="playground-section">
        <div className="playground-section-header">
          <div className="playground-section-title-wrap">
            <span>🎛️</span>
            <h2 className="playground-section-title">
              4. Linux TC 流量控制与 BBR/fq Pacing 模拟器
            </h2>
          </div>
          <Link
            href="/writing/kernel-05-tc-bbr-qdisc-traffic-shaping"
            className="playground-section-sublink"
          >
            查看原理解析 ──►
          </Link>
        </div>
        <TCPacingSimulator />
      </section>
    </div>
  );
}
