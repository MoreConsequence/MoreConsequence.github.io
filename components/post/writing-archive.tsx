"use client";

import { useMemo, useState, useTransition } from "react";
import type { CompiledPost, PostSource } from "@/lib/content/types";
import { PILLARS, type PillarId, getPostPillarId } from "@/lib/content/taxonomy";
import { groupPostsByYear } from "./post-list";
import { PostCard } from "./post-card";

type ListPost = PostSource | CompiledPost;

const PILLAR_ORDER: { id: "all" | PillarId; label: string; icon?: string }[] = [
  { id: "all", label: "全部" },
  { id: "ai-systems", label: "大模型与智能体", icon: "🔮" },
  { id: "distributed-systems", label: "分布式与存储", icon: "🏛️" },
  { id: "kernel-performance", label: "内核与底层", icon: "🐧" },
  { id: "network-iot", label: "网络协议与云网", icon: "🌐" },
  { id: "architecture-practice", label: "系统设计与架构", icon: "🏗️" },
];

export function WritingArchive({ posts }: { posts: ListPost[] }) {
  const [activePillar, setActivePillar] = useState<"all" | PillarId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [, startTransition] = useTransition();

  // 预计算文章归属的板块映射
  const postPillarMap = useMemo(() => {
    const map = new Map<string, PillarId>();
    for (const post of posts) {
      map.set(
        post.slug,
        getPostPillarId(post.slug, post.meta.series, post.meta.tags),
      );
    }
    return map;
  }, [posts]);

  // 统计每个板块的文章数量
  const pillarCounts = useMemo(() => {
    const counts: Record<string, number> = { all: posts.length };
    for (const pillarId of Object.keys(PILLARS)) {
      counts[pillarId] = 0;
    }
    for (const post of posts) {
      const p = postPillarMap.get(post.slug);
      if (p) counts[p] = (counts[p] || 0) + 1;
    }
    return counts;
  }, [posts, postPillarMap]);

  // 根据当前选中的板块与关键词进行过滤
  const filteredPosts = useMemo(() => {
    let result = posts;

    if (activePillar !== "all") {
      result = result.filter(
        (post) => postPillarMap.get(post.slug) === activePillar,
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((post) => {
        return (
          post.meta.title.toLowerCase().includes(q) ||
          post.meta.description.toLowerCase().includes(q) ||
          (post.meta.series && post.meta.series.toLowerCase().includes(q)) ||
          post.meta.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [posts, activePillar, searchQuery, postPillarMap]);

  const groups = useMemo(() => groupPostsByYear(filteredPosts), [filteredPosts]);

  const currentPillarInfo = activePillar !== "all" ? PILLARS[activePillar] : null;

  return (
    <div className="writing-archive-container">
      {/* 顶部技术板块分类 Tab 栏 */}
      <div className="pillar-filter-bar" role="tablist" aria-label="按技术领域筛选">
        {PILLAR_ORDER.map((tab) => {
          const count = pillarCounts[tab.id] ?? 0;
          const isActive = activePillar === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`pillar-tab-btn ${isActive ? "active" : ""}`}
              onClick={() => {
                startTransition(() => {
                  setActivePillar(tab.id);
                });
              }}
            >
              {tab.icon && <span className="tab-icon">{tab.icon}</span>}
              <span className="tab-label">{tab.label}</span>
              <span className="tab-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 板块导读与即时搜索栏 */}
      <div className="archive-toolbar">
        <div className="toolbar-info">
          {currentPillarInfo ? (
            <div className="pillar-spotlight">
              <div className="pillar-spotlight-header">
                <span className="spotlight-icon">{currentPillarInfo.icon}</span>
                <h3>{currentPillarInfo.name}</h3>
                <span className="spotlight-en">{currentPillarInfo.nameEn}</span>
              </div>
              <p className="spotlight-desc">{currentPillarInfo.description}</p>
            </div>
          ) : (
            <p className="toolbar-summary">
              全站共收录 <strong>{posts.length}</strong> 篇工程判断与深度剖析。支持按技术支柱过滤或搜索。
            </p>
          )}
        </div>

        <div className="toolbar-search">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文章标题、摘要或标签..."
            className="filter-search-input"
            aria-label="在当前列表中搜索"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 文章列表 */}
      {filteredPosts.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">∅</span>
          <h2>未找到匹配的文章</h2>
          <p>换一个搜索关键词或切换到其他板块试试。</p>
          {searchQuery && (
            <button
              type="button"
              className="button-primary"
              onClick={() => setSearchQuery("")}
            >
              清空搜索条件
            </button>
          )}
        </div>
      ) : (
        <div className="archive-groups">
          {groups.map((group) => (
            <section className="archive-group" key={group.year}>
              <div className="archive-year">
                <span>{group.year}</span>
                <small>{group.posts.length} 篇</small>
              </div>
              <div className="archive-posts">
                {group.posts.map((post, index) => (
                  <PostCard key={post.slug} post={post} index={index + 1} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
