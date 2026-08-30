import type { Metadata } from "next";
import Link from "next/link";
import { VectorClockSimulator } from "@/components/sandboxes/vector-clock-simulator";

export const metadata: Metadata = {
  title: "向量时钟因果分叉与冲突判定沙盒 | 交互式实验室",
  description: "三节点时空生命线，交互式演示 Happens-Before 因果先后与并发分支冲突判定。",
};

export default function VectorClockPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6">
        <Link href="/playground" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          ← 返回实验室总览
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
          🧭 向量时钟因果分叉与冲突判定沙盒
        </h1>
      </div>
      <VectorClockSimulator />
    </div>
  );
}
