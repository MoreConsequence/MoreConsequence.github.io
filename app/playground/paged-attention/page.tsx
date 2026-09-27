import type { Metadata } from "next";
import Link from "next/link";
import { PagedAttentionSimulator } from "@/components/sandboxes/paged-attention-simulator";

export const metadata: Metadata = {
  title: "PagedAttention 显存虚拟分页与 CoW 交互沙盘 | 交互式实验室",
  description: "交互式体验大模型虚拟内存分页架构：探索物理块池、逻辑页表、前缀零拷贝共享、写时复制（Copy-on-Write）分支与显存换出/换入机制。",
};

export default function PagedAttentionPlaygroundPage() {
  return (
    <div className="playground-page">
      <div className="mb-6">
        <Link href="/playground" className="playground-section-sublink">
          ← 返回实验室总览
        </Link>
        <h1 className="playground-title" style={{ marginTop: "0.5rem" }}>
          🧩 PagedAttention 显存虚拟分页与 CoW 交互沙盘
        </h1>
      </div>
      <PagedAttentionSimulator />
    </div>
  );
}
