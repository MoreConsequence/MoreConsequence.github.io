import type { Metadata } from "next";
import Link from "next/link";
import { RaftSimulator } from "@/components/sandboxes/raft-simulator";

export const metadata: Metadata = {
  title: "Raft 分布式集群与网络分区模拟器 | 交互式实验室",
  description: "5 节点动态集群状态机，实操检验非对称网络分区下 Pre-Vote 如何防御脑裂与任期暴涨。",
};

export default function RaftSimulatorPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6">
        <Link href="/playground" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          ← 返回实验室总览
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
          🏛️ Raft 分布式集群与网络分区模拟器
        </h1>
      </div>
      <RaftSimulator />
    </div>
  );
}
