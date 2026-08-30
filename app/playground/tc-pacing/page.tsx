import type { Metadata } from "next";
import Link from "next/link";
import { TCPacingSimulator } from "@/components/sandboxes/tc-pacing-simulator";

export const metadata: Metadata = {
  title: "Linux TC 流量控制与 BBR/fq Pacing 模拟器 | 交互式实验室",
  description: "对比传统 pfifo_fast 突发拥塞与 Fair Queueing (fq) 纳秒级匀速发包对 Bufferbloat 排队延迟的消除。",
};

export default function TCPacingPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6">
        <Link href="/playground" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          ← 返回实验室总览
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
          🎛️ Linux TC 流量控制与 BBR/fq Pacing 模拟器
        </h1>
      </div>
      <TCPacingSimulator />
    </div>
  );
}
