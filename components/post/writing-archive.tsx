"use client";

import { useMemo, useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  X,
  LayoutGrid,
  List,
  Sparkles,
  Database,
  Terminal,
  Globe,
  Compass,
  Layers,
} from "lucide-react";
import type { CompiledPost, PostSource, PostSummary } from "@/lib/content/types";
import { PILLARS, type PillarId, getPostPillarId } from "@/lib/content/taxonomy";
import { Badge } from "@/components/ui/badge";
import { groupPostsByYear } from "./post-list";
import { PostCard, estimateReadingMinutes } from "./post-card";

type ListPost = PostSource | CompiledPost | PostSummary;

const PAGE_SIZE = 24;

const PILLAR_ORDER: {
  id: "all" | PillarId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "all", label: "全部", icon: Layers },
  { id: "ai-systems", label: "大模型与智能体", icon: Sparkles },
  { id: "distributed-systems", label: "分布式与存储", icon: Database },
  { id: "kernel-performance", label: "内核与底层", icon: Terminal },
  { id: "network-iot", label: "网络协议与云网", icon: Globe },
  { id: "architecture-practice", label: "系统设计与架构", icon: Compass },
];

export function WritingArchive({ posts }: { posts: ListPost[] }) {
  const [activePillar, setActivePillar] = useState<"all" | PillarId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  // 从 localStorage 恢复用户偏好的视图模式
  useEffect(() => {
    try {
      const saved = localStorage.getItem("writing-view-mode");
      if (saved === "grid" || saved === "list") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViewMode(saved);
      }
    } catch {}
  }, []);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("writing-view-mode", mode);
    } catch {}
  };

  // 全局 '/' 键快速聚焦搜索栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  // 渐进式分页渲染：避免一次性向 DOM 挂载 450+ 张复杂卡片造成主线程卡顿
  const displayedPosts = useMemo(
    () => filteredPosts.slice(0, visibleCount),
    [filteredPosts, visibleCount],
  );

  const groups = useMemo(() => groupPostsByYear(displayedPosts), [displayedPosts]);
  const hasMore = visibleCount < filteredPosts.length;
  const remainingCount = filteredPosts.length - visibleCount;

  const currentPillarInfo = activePillar !== "all" ? PILLARS[activePillar] : null;

  return (
    <div className="writing-archive-container">
      {/* 顶部技术板块分类 Tab 栏 */}
      <div className="pillar-filter-bar" role="tablist" aria-label="按技术领域筛选">
        {PILLAR_ORDER.map((tab) => {
          const count = pillarCounts[tab.id] ?? 0;
          const isActive = activePillar === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`pillar-tab-btn ${isActive ? "active" : ""}`}
              onClick={() => {
                startTransition(() => {
                  setActivePillar(tab.id);
                  setVisibleCount(PAGE_SIZE);
                });
              }}
            >
              <span className="tab-icon">
                <Icon size={14} className="pillar-tab-lucide" />
              </span>
              <span className="tab-label">{tab.label}</span>
              <span className="tab-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 板块导读、即时搜索与视图模式栏 */}
      <div className="archive-toolbar">
        <div className="toolbar-info">
          {currentPillarInfo ? (
            <div className="pillar-spotlight">
              <div className="pillar-spotlight-header">
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

        <div className="toolbar-controls">
          <div className="toolbar-search">
            <span className="search-icon-slot" aria-hidden="true">
              <Search size={15} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="搜索文章标题、摘要或标签..."
              className="filter-search-input"
              aria-label="在当前列表中搜索"
            />
            {searchQuery ? (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => {
                  setSearchQuery("");
                  setVisibleCount(PAGE_SIZE);
                  searchInputRef.current?.focus();
                }}
                title="清空搜索条件"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="search-kbd-hint" aria-hidden="true" title="按 '/' 键快速搜索">/</kbd>
            )}
          </div>

          {/* 视图模式切换：网格卡片 vs 紧凑列表 */}
          <div className="view-mode-toggle" role="group" aria-label="视图模式切换">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => handleViewModeChange("grid")}
              title="卡片网格视图"
              aria-label="卡片网格视图"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid size={14} />
              <span>卡片</span>
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => handleViewModeChange("list")}
              title="紧凑时间线列表（更适合快速扫读）"
              aria-label="紧凑列表视图"
              aria-pressed={viewMode === "list"}
            >
              <List size={14} />
              <span>紧凑</span>
            </button>
          </div>
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
              onClick={() => {
                setSearchQuery("");
                setVisibleCount(PAGE_SIZE);
              }}
            >
              清空搜索条件
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="archive-groups">
            {groups.map((group) => (
              <section className="archive-group" key={group.year}>
                <div className="archive-year">
                  <span>{group.year}</span>
                  <small>{group.posts.length} 篇</small>
                </div>

                {viewMode === "grid" ? (
                  <div className="archive-posts">
                    {group.posts.map((post, index) => (
                      <PostCard key={post.slug} post={post} index={index + 1} />
                    ))}
                  </div>
                ) : (
                  <div className="archive-compact-list" role="list">
                    {group.posts.map((post) => (
                      <Link
                        key={post.slug}
                        href={`/writing/${post.slug}`}
                        className="archive-compact-row"
                        role="listitem"
                      >
                        <div className="compact-row-main">
                          <span className="compact-row-title">{post.meta.title}</span>
                          {post.meta.series && (
                            <Badge variant="series" size="sm" dot>
                              {post.meta.series}
                            </Badge>
                          )}
                        </div>
                        <div className="compact-row-meta">
                          <span className="compact-row-reading">
                            {estimateReadingMinutes(post)} 分钟
                          </span>
                          <time className="compact-row-date" dateTime={post.meta.publishedAt}>
                            {post.meta.publishedAt.slice(5, 10)}
                          </time>
                          <span className="compact-row-arrow" aria-hidden="true">→</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* 分页 / 加载更多状态栏 */}
          {hasMore && (
            <div className="archive-pagination">
              <div className="pagination-info">
                <span>
                  已显示 <strong>{displayedPosts.length}</strong> / 共 <strong>{filteredPosts.length}</strong> 篇
                </span>
                <div
                  className="pagination-progress-bar"
                  role="progressbar"
                  aria-valuenow={displayedPosts.length}
                  aria-valuemin={0}
                  aria-valuemax={filteredPosts.length}
                >
                  <div
                    className="pagination-progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((displayedPosts.length / filteredPosts.length) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="load-more-btn"
                  onClick={() =>
                    setVisibleCount((prev) =>
                      Math.min(filteredPosts.length, prev + PAGE_SIZE),
                    )
                  }
                >
                  加载更多文章（剩余 {remainingCount} 篇）↓
                </button>
                {remainingCount > PAGE_SIZE && (
                  <button
                    type="button"
                    className="show-all-btn"
                    onClick={() => setVisibleCount(filteredPosts.length)}
                  >
                    展开全部（{filteredPosts.length} 篇）
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
