"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUp, Bookmark, Calendar, Check, Clock, Copy, Hash, Layers, Terminal } from "lucide-react";
import type { PostMeta as PostMetaType } from "@/lib/content/types";
import { tagHref, seriesHref } from "@/lib/site-links";

interface ArticleCompanionProps {
  meta: PostMetaType;
  readingTimeMinutes: number;
  seriesPosts?: Array<{ slug: string; meta: PostMetaType }>;
  currentSeriesIndex?: number;
}

export function ArticleCompanion({
  meta,
  readingTimeMinutes,
  seriesPosts = [],
  currentSeriesIndex = -1,
}: ArticleCompanionProps) {
  const [copied, setCopied] = useState(false);

  const copyMarkdownLink = () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const markdown = `[${meta.title}](${url})`;
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const scrollToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openTerminal = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("terminal-exec", {
          detail: { command: "uname -a" },
        })
      );
    }
  };

  const hasSeries = Boolean(meta.series && seriesPosts.length > 0 && currentSeriesIndex >= 0);

  return (
    <aside className="article-companion" aria-label="文章伴随面板与元数据">
      {/* 专栏导航卡 (若属于系列) */}
      {hasSeries && (
        <div className="companion-block companion-series-card">
          <div className="companion-block-header">
            <span className="companion-header-icon"><Layers size={14} /></span>
            <span className="companion-header-title">专栏路线</span>
            <span className="companion-series-badge">
              {currentSeriesIndex + 1} / {seriesPosts.length}
            </span>
          </div>
          <Link href={seriesHref(meta.series!)} className="companion-series-title">
            《{meta.series}》
          </Link>
          <div className="companion-series-progress">
            <div
              className="companion-series-bar"
              style={{
                width: `${Math.round(((currentSeriesIndex + 1) / seriesPosts.length) * 100)}%`,
              }}
            />
          </div>
          <div className="companion-series-links">
            {currentSeriesIndex > 0 && (
              <Link
                href={`/writing/${seriesPosts[currentSeriesIndex - 1]?.slug}`}
                className="companion-nav-btn prev"
                title={seriesPosts[currentSeriesIndex - 1]?.meta.title}
              >
                ← 上一章
              </Link>
            )}
            {currentSeriesIndex < seriesPosts.length - 1 && (
              <Link
                href={`/writing/${seriesPosts[currentSeriesIndex + 1]?.slug}`}
                className="companion-nav-btn next"
                title={seriesPosts[currentSeriesIndex + 1]?.meta.title}
              >
                下一章 →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* 规格元数据卡 */}
      <div className="companion-block companion-meta-card">
        <div className="companion-block-header">
          <span className="companion-header-icon"><Bookmark size={14} /></span>
          <span className="companion-header-title">技术规格</span>
        </div>
        <div className="companion-meta-rows">
          <div className="companion-meta-item">
            <span className="companion-meta-label">
              <Calendar size={13} /> 发布时间
            </span>
            <span className="companion-meta-val">
              {meta.publishedAt.replaceAll("-", ".")}
            </span>
          </div>
          <div className="companion-meta-item">
            <span className="companion-meta-label">
              <Clock size={13} /> 建议耗时
            </span>
            <span className="companion-meta-val">
              {readingTimeMinutes} 分钟精读
            </span>
          </div>
          {meta.updatedAt && (
            <div className="companion-meta-item">
              <span className="companion-meta-label">
                <Calendar size={13} /> 最近校准
              </span>
              <span className="companion-meta-val">
                {meta.updatedAt.replaceAll("-", ".")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 核心技术标签 */}
      {meta.tags.length > 0 && (
        <div className="companion-block companion-tags-card">
          <div className="companion-block-header">
            <span className="companion-header-icon"><Hash size={14} /></span>
            <span className="companion-header-title">涉及技术栈</span>
          </div>
          <div className="companion-tags-cloud">
            {meta.tags.map((tag) => (
              <Link key={tag} href={tagHref(tag)} className="companion-tag-pill">
                {tag}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 快捷工具箱 */}
      <div className="companion-block companion-tools-card">
        <div className="companion-block-header">
          <span className="companion-header-icon"><Terminal size={14} /></span>
          <span className="companion-header-title">快速工具</span>
        </div>
        <div className="companion-tools-btns">
          <button
            type="button"
            className="companion-tool-btn"
            onClick={copyMarkdownLink}
          >
            {copied ? <Check size={14} color="var(--accent)" /> : <Copy size={14} />}
            <span>{copied ? "已复制引用链接" : "复制 Markdown 链接"}</span>
          </button>
          <button
            type="button"
            className="companion-tool-btn"
            onClick={openTerminal}
          >
            <Terminal size={14} />
            <span>唤起虚拟终端</span>
          </button>
          <button
            type="button"
            className="companion-tool-btn"
            onClick={scrollToTop}
          >
            <ArrowUp size={14} />
            <span>返回文章顶部</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
