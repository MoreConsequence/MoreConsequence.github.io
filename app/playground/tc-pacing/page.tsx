import type { Metadata } from "next";
import Link from "next/link";
import { TCPacingSimulator } from "@/components/sandboxes/tc-pacing-simulator";

export const metadata: Metadata = {
  title: "Linux TC 流量控制与 BBR/fq Pacing 模拟器 | 交互式实验室",
  description: "对比传统 pfifo_fast 突发拥塞与 Fair Queueing (fq) 纳秒级匀速发包对 Bufferbloat 排队延迟的消除。",
};

export default function TCPacingPage() {
  return (
    <div className="playground-page">
      <div className="mb-6">
        <Link href="/playground" className="playground-section-sublink">
          ← 返回实验室总览
        </Link>
        <h1 className="playground-title" style={{ marginTop: '0.5rem' }}>
          🎛️ Linux TC 流量控制与 BBR/fq Pacing 模拟器
        </h1>
      </div>
      <TCPacingSimulator />
    </div>
  );
}
