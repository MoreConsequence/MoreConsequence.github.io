"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ListTree, BookOpen, ArrowRight } from "lucide-react";
import type { TocItem, PostMeta } from "@/lib/content/types";

type SeriesPostItem = {
  slug: string;
  meta: PostMeta;
};

export function ArticleSidebar({
  items,
  series,
  seriesPosts = [],
  currentSlug,
  currentSeriesIndex = 0,
  seriesHrefUrl = "",
}: {
  items: TocItem[];
  series?: string;
  seriesPosts?: SeriesPostItem[];
  currentSlug: string;
  currentSeriesIndex?: number;
  seriesIcon?: string;
  seriesHrefUrl?: string;
}) {
  const hasSeries = seriesPosts.length > 1;
  const [tab, setTab] = useState<"toc" | "series">("toc");
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const activeSeriesItemRef = useRef<HTMLLIElement>(null);

  // IntersectionObserver 追踪正文当前激活标题
  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((heading): heading is HTMLElement => Boolean(heading));

    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: "-18% 0px -72% 0px" },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  // 当切换到专栏 Tab 时，自动定位到当前文章
  useEffect(() => {
    if (tab === "series" && activeSeriesItemRef.current) {
      activeSeriesItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [tab]);

  if (!items.length && !hasSeries) return null;

  return (
    <aside className="article-aside">
      <div className="sidebar-panel article-nav-panel">
        {hasSeries ? (
          <div className="sidebar-tabs-bar" role="tablist" aria-label="侧边栏导航切换">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "toc"}
              className={`sidebar-tab-btn ${tab === "toc" ? "active" : ""}`}
              onClick={() => setTab("toc")}
            >
              <span className="tab-icon">
                <ListTree size={14} />
              </span>
              <span className="tab-text">本文目录</span>
              <span className="tab-count">{items.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "series"}
              className={`sidebar-tab-btn ${tab === "series" ? "active" : ""}`}
              onClick={() => setTab("series")}
            >
              <span className="tab-icon">
                <BookOpen size={14} />
              </span>
              <span className="tab-text">专栏连载</span>
              <span className="tab-count">
                {currentSeriesIndex + 1}/{seriesPosts.length}
              </span>
            </button>
          </div>
        ) : (
          <div className="sidebar-panel-header">
            <span className="sph-title">
              <ListTree size={14} /> 本文目录
            </span>
            <span className="sph-badge">
              {String(items.length).padStart(2, "0")}
            </span>
          </div>
        )}

        {/* 目录视图 */}
        {tab === "toc" ? (
          <ol className="sidebar-panel-list toc-list" aria-label="文章目录">
            {items.map((item) => (
              <li key={item.id} data-depth={item.depth}>
                <a
                  href={"#" + item.id}
                  aria-current={activeId === item.id}
                  title={item.title}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ol>
        ) : (
          /* 专栏章节视图 */
          <div className="sidebar-series-view">
            {seriesHrefUrl && (
              <div className="series-view-header">
                <Link
                  href={seriesHrefUrl}
                  className="series-view-link"
                  title={`查看《${series}》全部目录`}
                >
                  <span>查看专栏全景图</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            )}
            <ol className="sidebar-panel-list series-list" aria-label="专栏全部文章">
              {seriesPosts.map((item, index) => {
                const isCurrent = item.slug === currentSlug;
                return (
                  <li
                    key={item.slug}
                    ref={isCurrent ? activeSeriesItemRef : undefined}
                    data-current={isCurrent || undefined}
                  >
                    <Link
                      href={`/writing/${item.slug}`}
                      className="sidebar-series-item-link"
                      aria-current={isCurrent ? "page" : undefined}
                    >
                      <span className="series-item-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="series-item-title">{item.meta.title}</span>
                      {isCurrent && <span className="series-item-dot" />}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </aside>
  );
}
