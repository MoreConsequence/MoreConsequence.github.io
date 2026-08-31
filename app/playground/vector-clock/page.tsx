import type { Metadata } from "next";
import Link from "next/link";
import { VectorClockSimulator } from "@/components/sandboxes/vector-clock-simulator";

export const metadata: Metadata = {
  title: "向量时钟因果分叉与冲突判定沙盒 | 交互式实验室",
  description: "三节点时空生命线，交互式演示 Happens-Before 因果先后与并发分支冲突判定。",
};

export default function VectorClockPage() {
  return (
    <div className="playground-page">
      <div className="mb-6">
        <Link href="/playground" className="playground-section-sublink">
          ← 返回实验室总览
        </Link>
        <h1 className="playground-title" style={{ marginTop: '0.5rem' }}>
          🧭 向量时钟因果分叉与冲突判定沙盒
        </h1>
      </div>
      <VectorClockSimulator />
    </div>
  );
}
