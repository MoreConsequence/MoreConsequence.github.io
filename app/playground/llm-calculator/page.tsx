import type { Metadata } from "next";
import Link from "next/link";
import { LLMCalculator } from "@/components/sandboxes/llm-calculator";

export const metadata: Metadata = {
  title: "大模型显存容量与吞吐配平计算器 | 交互式实验室",
  description: "实时计算 LLaMA-3、DeepSeek-V3 等主流大模型的静态权重、KV Cache 显存容量与 GPU OOM 告警。",
};

export default function LLMCalculatorPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6">
        <Link href="/playground" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          ← 返回实验室总览
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
          🧮 大模型显存容量与吞吐配平计算器
        </h1>
      </div>
      <LLMCalculator />
    </div>
  );
}
