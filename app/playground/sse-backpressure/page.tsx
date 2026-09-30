import type { Metadata } from "next";
import Link from "next/link";
import { SSEBackpressureSimulator } from "@/components/sandboxes/sse-backpressure-simulator";

export const metadata: Metadata = {
  title: "高并发 SSE 流式反压模拟器 — 交互式系统实验室",
  description: "在线对比高并发流式网关在慢速消费者下的内存暴涨与 TCP Zero Window / 高低水位线反压流控的有界内存防护。",
};

export default function SSEBackpressurePlayground() {
  return (
    <div className="playground-single-page">
      <div className="playground-back-nav">
        <Link href="/playground" className="playground-back-link">
          ← 返回实验室总览
        </Link>
        <span className="playground-crumb-sep">/</span>
        <span className="playground-crumb-cur">SSE 反压流控模拟器</span>
      </div>

      <div className="playground-single-hero">
        <h1>高并发 SSE 长连接反压（Backpressure）机制模拟器</h1>
        <p>
          大模型推理和流式网关（SSE / Chunked Transfer）的生产核心陷阱：当上游极速产生 Token 而下游客户端网络受阻时，网关如果不具备反压能力，内存将被在途队列撑爆（OOM）。本沙盒交互式展示水位线反压如何让内存始终严格有界。
        </p>
      </div>

      <div className="playground-standalone-box">
        <SSEBackpressureSimulator />
      </div>

      <div className="playground-related-card">
        <h3>📚 推荐阅读深度原理解析</h3>
        <p>
          深入剖析从 Linux TCP Socket 接收/发送缓冲区、TCP Zero Window 探测、到 Envoy 水位线与 Node.js drain 事件的完整反压链路。
        </p>
        <Link
          href="/writing/sse-streaming-gateway-and-backpressure-engineering"
          className="playground-doc-btn"
        >
          阅读《百万级流式长连接与反压实战》──►
        </Link>
      </div>
    </div>
  );
}
