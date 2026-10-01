import type { Metadata } from "next";
import Link from "next/link";
import { CacheConsistencySimulator } from "@/components/sandboxes/cache-consistency-simulator";

export const metadata: Metadata = {
  title: "缓存一致性与并发竞态沙盒 — 交互式系统实验室",
  description: "在线推演 Cache-Aside、延迟双删的时序空洞，与版本号栅栏（Version Fencing）如何通过原子 CAS 彻底终结旧值复活。",
};

export default function CacheConsistencyPlayground() {
  return (
    <div className="playground-single-page">
      <div className="playground-back-nav">
        <Link href="/playground" className="playground-back-link">
          ← 返回实验室总览
        </Link>
        <span className="playground-crumb-sep">/</span>
        <span className="playground-crumb-cur">缓存一致性时序沙盒</span>
      </div>

      <div className="playground-single-hero">
        <h1>缓存与数据库并发一致性时序模拟器</h1>
        <p>
          后端系统设计中最具争议的核心命题：当读写线程在微秒级并发交错时，为什么“先写库后删缓存”和“延迟双删”依然无法杜绝旧值复活？本沙盒支持单步时序推演与版本号栅栏（Version Fencing）确定性解法验证。
        </p>
      </div>

      <div className="playground-standalone-box">
        <CacheConsistencySimulator />
      </div>

      <div className="playground-related-card">
        <h3>📚 推荐阅读深度原理解析</h3>
        <p>
          深入剖析从读写时序因果图、长尾延迟空洞到 Redis Lua 版本号栅栏与 Binlog CDC 的完整防线。
        </p>
        <Link
          href="/writing/cache-consistency-concurrency-version-fencing"
          className="playground-doc-btn"
        >
          阅读《高并发缓存一致性的确定性裁决》──►
        </Link>
      </div>
    </div>
  );
}
