"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    let ticking = false;

    const updateProgress = () => {
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
      setShowBackToTop(window.scrollY > 500);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateProgress);
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateProgress();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <div
        className="reading-progress-track"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="文章阅读进度"
      >
        <div
          className="reading-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <button
        type="button"
        className={`back-to-top-btn ${showBackToTop ? "visible" : ""}`}
        onClick={scrollToTop}
        aria-label="回到顶部"
        title="回到顶部"
      >
        <ArrowUp size={16} aria-hidden="true" />
      </button>
    </>
  );
}
