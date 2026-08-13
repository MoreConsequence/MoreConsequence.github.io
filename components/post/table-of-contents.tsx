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
    <nav className="table-of-contents" aria-label="本文目录">
      <p>
        本文目录
        <span className="toc-count">({String(items.length).padStart(2, "0")})</span>
      </p>
      <ol>
        {items.map((item) => (
          <li key={item.id} data-depth={item.depth}>
            <a href={"#" + item.id} aria-current={activeId === item.id}>
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

