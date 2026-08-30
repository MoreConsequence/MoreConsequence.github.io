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
    <div className="container mx-auto max-w-5xl px-4 py-12">
      {/* Hero Header */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/70 px-3.5 py-1 text-xs font-bold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
          <span>✨</span> Interactive Engineering Labs
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          交互式系统设计实验室
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 dark:text-slate-400">
          突破静态图文边界。在这里，你可以直接在浏览器中滑动参数、注入网络故障、把玩分布式状态机与显存/网络调度内核。
        </p>
      </div>

      {/* Sandbox Cards Nav */}
      <div className="mb-16 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {SANDBOX_LIST.map((box) => (
          <div
            key={box.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
          >
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl shadow-inner dark:bg-slate-800">
                  {box.icon}
                </span>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {box.title}
                </h2>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {box.desc}
              </p>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <Link
                  href={box.relatedArticle}
                  className="truncate text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                  title={box.relatedTitle}
                >
                  📖 专栏对应文章
                </Link>
                <a
                  href={`#${box.id}`}
                  className="font-bold text-blue-600 hover:underline dark:text-blue-400"
                >
                  向下直达把玩 ↓
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sandbox 1: LLM Calculator */}
      <section id="llm-calc" className="mb-16 scroll-mt-20">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧮</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              1. 大模型显存容量与吞吐配平计算器
            </h2>
          </div>
          <Link
            href="/writing/llm-01-kv-cache-paged-attention"
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            查看原理解析 ──►
          </Link>
        </div>
        <LLMCalculator />
      </section>

      {/* Sandbox 2: Raft Simulator */}
      <section id="raft-sim" className="mb-16 scroll-mt-20">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏛️</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              2. Raft 分布式集群与网络分区模拟器
            </h2>
          </div>
          <Link
            href="/writing/consensus-01-raft-state-machine-replication"
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            查看原理解析 ──►
          </Link>
        </div>
        <RaftSimulator />
      </section>

      {/* Sandbox 3: Vector Clock */}
      <section id="vector-clock" className="mb-16 scroll-mt-20">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧭</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              3. 向量时钟因果分叉与冲突判定沙盒
            </h2>
          </div>
          <Link
            href="/writing/consensus-04-logical-clocks-vector-spanner-truetime"
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            查看原理解析 ──►
          </Link>
        </div>
        <VectorClockSimulator />
      </section>

      {/* Sandbox 4: Linux TC Pacing */}
      <section id="tc-pacing" className="mb-16 scroll-mt-20">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎛️</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              4. Linux TC 流量控制与 BBR/fq Pacing 模拟器
            </h2>
          </div>
          <Link
            href="/writing/kernel-05-tc-bbr-qdisc-traffic-shaping"
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            查看原理解析 ──►
          </Link>
        </div>
        <TCPacingSimulator />
      </section>
    </div>
  );
}
