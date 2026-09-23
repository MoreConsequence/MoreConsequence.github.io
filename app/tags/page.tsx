import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/content/posts";
import { collectTags } from "@/lib/content/tags";
import { TagsExplorer } from "@/components/tags/tags-explorer";
import { tagHref } from "@/lib/site-links";

export const metadata: Metadata = {
  title: "主题标签",
  description: "沿着技术主题与核心领域浏览全部长文，支持即时搜索与频次过滤。",
};

// 预定义五大支柱核心标签分组
const CURATED_PILLAR_TAGS = [
  {
    pillar: "大模型与智能体",
    icon: "🔮",
    tags: ["LLM", "Agent", "AI后端工程", "vLLM", "RAG", "推测解码", "Prompt Caching", "MCP"],
  },
  {
    pillar: "分布式系统与存储",
    icon: "🏛️",
    tags: ["分布式系统", "高并发", "数据库", "Redis", "MySQL", "存储引擎", "ClickHouse", "PostgreSQL"],
  },
  {
    pillar: "Linux 内核与系统底层",
    icon: "🐧",
    tags: ["Linux内核", "eBPF", "性能优化", "并发", "内存管理", "测速工程", "操作系统"],
  },
  {
    pillar: "网络协议与云网协同",
    icon: "🌐",
    tags: ["网络协议", "IoT Platform", "Network Devices", "CDN", "ZTP", "YANG", "Batfish", "IPFIX"],
  },
  {
    pillar: "系统架构与工程实战",
    icon: "🏗️",
    tags: ["系统设计", "面试题", "Go", "TypeScript", "Node.js", "工程实践", "架构演进"],
  },
];

export default async function TagsPage() {
  const posts = await getAllPosts();
  const allTags = collectTags(posts);

  // 构造快速查询 Map 获取每个标签的文章数量
  const tagCountMap = new Map(allTags.map((t) => [t.name.toLowerCase(), t.count]));

  return (
    <div className="tags-page-redesign">
      <header className="page-intro">
        <p className="eyebrow">Taxonomy / {allTags.length} subjects</p>
        <h1>主题标签索引</h1>
        <p>
          从技术主题切入跨越单一时间线的知识网络。上方展示五大领域核心高频主题，下方提供全量标签即时检索与频次筛选。
        </p>
      </header>

      {/* 核心黄金标签聚合区域 */}
      <section className="curated-tags-section">
        <div className="section-subtitle-bar">
          <span className="subtitle-icon">⭐</span>
          <h2>核心高频技术主题</h2>
          <span className="subtitle-hint">精选全站最高频的核心技术主线</span>
        </div>

        <div className="curated-pillar-groups">
          {CURATED_PILLAR_TAGS.map((group) => (
            <div key={group.pillar} className="curated-pillar-box">
              <div className="curated-box-header">
                <span className="box-icon">{group.icon}</span>
                <h3>{group.pillar}</h3>
              </div>
              <div className="curated-tags-pills">
                {group.tags.map((tagName) => {
                  const count = tagCountMap.get(tagName.toLowerCase()) ?? 0;
                  return (
                    <Link
                      key={tagName}
                      href={tagHref(tagName)}
                      className="curated-tag-pill"
                    >
                      <span className="pill-name">{tagName}</span>
                      {count > 0 && <span className="pill-count">{count}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 全量标签浏览器（带实时搜索与文章数筛选） */}
      <section className="all-tags-explorer-section">
        <div className="section-subtitle-bar">
          <span className="subtitle-icon">🔍</span>
          <h2>全量标签检索空间</h2>
          <span className="subtitle-hint">收录全站 {allTags.length} 个技术标签，支持实时模糊搜索</span>
        </div>

        <TagsExplorer allTags={allTags} />
      </section>
    </div>
  );
}
