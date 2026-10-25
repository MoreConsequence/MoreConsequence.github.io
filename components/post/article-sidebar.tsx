"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ListTree, ChevronDown } from "lucide-react";
import type { TocItem, PostMeta } from "@/lib/content/types";
import { PixelMascot } from "@/components/ui/pixel-mascot";

type SeriesPostItem = {
  slug: string;
  meta: PostMeta;
};

// 渲染定宽 28 字符 ASCII 点阵进度条 (如 ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░ 28%)，饱满延展且与 260px 侧栏完美呼应
function getAsciiProgress(percent: number, totalChars = 28) {
  const filled = Math.min(totalChars, Math.max(0, Math.round((percent / 100) * totalChars)));
  const empty = totalChars - filled;
  return {
    filledText: "▓".repeat(filled),
    emptyText: "░".repeat(empty),
  };
}

export function ArticleSidebar({
  items,
  series,
  seriesPosts = [],
  currentSeriesIndex = 0,
  seriesHrefUrl = "",
  articleTitle = "",
  markdownBody = "",
}: {
  items: TocItem[];
  series?: string;
  seriesPosts?: SeriesPostItem[];
  currentSlug: string;
  currentSeriesIndex?: number;
  seriesIcon?: string;
  seriesHrefUrl?: string;
  articleTitle?: string;
  markdownBody?: string;
}) {
  const hasSeries = seriesPosts.length > 1;
  const [navOpen, setNavOpen] = useState(false);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [progress, setProgress] = useState(0);
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mascotMode, setMascotMode] = useState<"shelf" | "floating">("shelf");

  // 监听滚动实时计算阅读进度：以正文容器为基准，确保正文末尾与触底坚决达到 100%
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const articleEl =
            document.querySelector(".prose-column") ||
            document.querySelector(".article-layout") ||
            document.querySelector("article");

          let calculatedProgress = 0;

          if (articleEl) {
            const rect = articleEl.getBoundingClientRect();
            const articleTop = rect.top + window.scrollY;
            const articleHeight = rect.height;

            // 自然阅读视线行程：当正文末尾进入视口中下部阅读区间时，即视作 100% 全篇读完
            // 不需要强制读者把正文最后一行滚到屏幕物理最顶端或滑入推荐区
            const readingViewportHeight = window.innerHeight;
            const totalScrollableDistance = Math.max(100, articleHeight - (readingViewportHeight * 0.7));
            const currentScrolled = window.scrollY - articleTop;
            const progressRaw = (currentScrolled / totalScrollableDistance) * 100;
            calculatedProgress = Math.min(100, Math.max(0, Math.round(progressRaw)));

            // 确定性边界：只要正文底部已进入视口区间（距视口底部不足 120px），确凿判定 100% 满格
            if (rect.bottom <= readingViewportHeight + 120) {
              calculatedProgress = 100;
            }
          } else {
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            if (scrollHeight > 0) {
              calculatedProgress = Math.min(100, Math.max(0, Math.round((window.scrollY / scrollHeight) * 100)));
            }
          }

          // 页面触底或接近尾声保底满格
          const distToBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
          if (distToBottom < 300) {
            calculatedProgress = 100;
          }

          setProgress(calculatedProgress);
          setScrolledPastHero(window.scrollY > 280);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
      { rootMargin: "-12% 0px -70% 0px" },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  // 一键复制 Markdown 原文
  const handleCopyMarkdown = useCallback(async () => {
    try {
      const fullText = markdownBody
        ? (articleTitle ? `# ${articleTitle}\n\n` : "") + markdownBody
        : window.location.href;
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级回退
    }
  }, [articleTitle, markdownBody]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!items.length && !hasSeries) return null;

  const { filledText, emptyText } = getAsciiProgress(progress);

  return (
    <aside className="rail" aria-label="文章导读与目录">
      {/* 移动端伸缩控制按钮 */}
      <button
        className="article-nav-toggle"
        type="button"
        aria-expanded={navOpen}
        aria-controls="tree"
        onClick={() => setNavOpen(!navOpen)}
      >
        <ListTree size={16} aria-hidden="true" />
        <span>TREE · {progress}%</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      <div className="rail-content" data-open={navOpen}>
        {/* Sticky Rail Title (Handoff when scrolled past hero, exactly like claude.dev) */}
        <div className={`rail-title ${scrolledPastHero ? "on" : ""}`}>
          {articleTitle}
        </div>

        {/* 伴读专属栖息台：像素小仙 Dango Guardian */}
        <div className="rail-mascot-perch">
          <PixelMascot
            readingProgress={progress}
            positionMode={mascotMode}
            onToggleMode={() =>
              setMascotMode((prev) => (prev === "shelf" ? "floating" : "shelf"))
            }
          />
        </div>

        {/* 标头: TREE */}
        <div className="th">TREE</div>

        {/* 原生目录树 (Tree Items with └ symbol) */}
        <nav id="tree" aria-label="文章结构目录">
          {items.map((item) => {
            const isCurrent = activeId === item.id;
            const isSub = item.depth > 2;

            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`${isCurrent ? "on" : ""} ${isSub ? "sub" : ""}`}
                title={item.title}
              >
                <span className="br">└</span>
                <span className="tree-label">{item.title}</span>
              </a>
            );
          })}
        </nav>

        {/* ASCII 点阵终端进度条 (Iconic claude.dev Reading Progress) */}
        <div className="prog" id="prog" aria-label={`阅读进度：${progress}%`}>
          <b>{filledText}</b>
          <span>{emptyText}</span>
          <span className="pct">{String(progress).padStart(2, "0")}%</span>
        </div>

        {/* 快捷导航提示 */}
        <div className="hint">PRESS ↑ / ↓ TO SCROLL</div>

        {/* 工具与分享栏 */}
        <div className="share">
          <div className="th">ACTIONS</div>
          <a role="button" tabIndex={0} onClick={handleCopyMarkdown} title="复制全文 Markdown 原文">
            <span className="br">└</span>
            <span>{copied ? "COPIED MARKDOWN!" : "Copy markdown"}</span>
          </a>
          <a role="button" tabIndex={0} onClick={scrollToTop} title="返回顶部">
            <span className="br">└</span>
            <span>Back to top</span>
          </a>
          {hasSeries && seriesHrefUrl ? (
            <Link href={seriesHrefUrl} title={`专栏《${series}》`}>
              <span className="br">└</span>
              <span>
                {series} ({currentSeriesIndex + 1}/{seriesPosts.length})
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
