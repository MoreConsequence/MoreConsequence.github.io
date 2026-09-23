"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TagSummary } from "@/lib/content/tags";
import { tagHref } from "@/lib/site-links";

export function TagsExplorer({ allTags }: { allTags: TagSummary[] }) {
  const [query, setQuery] = useState("");
  const [minCountFilter, setMinCountFilter] = useState<number>(0);

  const filteredTags = useMemo(() => {
    let result = allTags;

    if (minCountFilter > 0) {
      result = result.filter((t) => t.count >= minCountFilter);
    }

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter((t) => t.name.toLowerCase().includes(q));
    }

    return result;
  }, [allTags, query, minCountFilter]);

  return (
    <div className="tags-explorer-container">
      <div className="tags-search-bar">
        <div className="search-input-wrapper">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入技术关键词搜索标签（如 eBPF, Raft, K8s, Redis...）"
            className="tags-search-input"
            aria-label="搜索标签"
          />
          {query && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setQuery("")}
            >
              ✕
            </button>
          )}
        </div>

        <div className="tags-filter-radios">
          <span className="filter-label">文章数筛选：</span>
          {[
            { label: "全部 (772)", val: 0 },
            { label: "≥ 3 篇", val: 3 },
            { label: "≥ 5 篇", val: 5 },
            { label: "≥ 10 篇", val: 10 },
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              className={`tag-filter-chip ${minCountFilter === item.val ? "active" : ""}`}
              onClick={() => setMinCountFilter(item.val)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tags-results-header">
        <span>
          共找到 <strong>{filteredTags.length}</strong> 个匹配主题
        </span>
      </div>

      {filteredTags.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">∅</span>
          <p>未找到匹配的主题标签，换个关键词试试。</p>
        </div>
      ) : (
        <div className="tag-index tags-grid-flow">
          {filteredTags.map((tag, index) => (
            <Link key={tag.name} href={tagHref(tag.name)} className="tag-pill-card">
              <span className="tag-index-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong className="tag-name">{tag.name}</strong>
              <span className="tag-badge">{tag.count} 篇</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
