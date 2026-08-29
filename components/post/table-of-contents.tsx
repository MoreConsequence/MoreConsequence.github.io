"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/content/types";

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

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

  if (!items.length) return null;

  return (
    <nav className="table-of-contents sidebar-panel" aria-label="本文目录">
      <div className="sidebar-panel-header">
        <span className="sph-title">📑 本文目录</span>
        <span className="sph-badge">
          {String(items.length).padStart(2, "0")}
        </span>
      </div>
      <ol className="sidebar-panel-list toc-list">
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
    </nav>
  );
}

