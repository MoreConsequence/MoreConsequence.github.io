"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Keyboard } from "lucide-react";

export function KeyboardNavigation() {
  const [showHelp, setShowHelp] = useState(false);

  const getHeadings = useCallback(() => {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        ".article-prose h2, .article-prose h3"
      )
    );
  }, []);

  const navigateHeading = useCallback(
    (direction: "next" | "prev") => {
      const headings = getHeadings();
      if (!headings.length) return;

      const currentScroll = window.scrollY + 100; // offset buffer
      let targetHeading: HTMLElement | null = null;

      if (direction === "next") {
        targetHeading =
          headings.find((h) => h.getBoundingClientRect().top + window.scrollY > currentScroll) ||
          headings[headings.length - 1] ||
          null;
      } else {
        const reversed = [...headings].reverse();
        targetHeading =
          reversed.find((h) => h.getBoundingClientRect().top + window.scrollY < currentScroll - 80) ||
          headings[0] ||
          null;
      }

      if (targetHeading) {
        targetHeading.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [getHeadings]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside input, textarea, search dialog or with modifier keys
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        navigateHeading("next");
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        navigateHeading("prev");
      } else if (e.key === "[") {
        // Prev article link
        const prevLink = document.querySelector<HTMLAnchorElement>(
          ".article-neighbors .neighbor-cell:first-child a"
        );
        if (prevLink) {
          e.preventDefault();
          prevLink.click();
        }
      } else if (e.key === "]") {
        // Next article link
        const nextLink = document.querySelector<HTMLAnchorElement>(
          ".article-neighbors .neighbor-cell:last-child a"
        );
        if (nextLink) {
          e.preventDefault();
          nextLink.click();
        }
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("terminal-exec", {
            detail: { command: "kubectl get nodes" },
          })
        );
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
      } else if (e.key === "Escape" && showHelp) {
        e.preventDefault();
        setShowHelp(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateHeading, showHelp]);

  return (
    <>
      {/* Floating Keyboard Pill */}
      <aside aria-label="快捷键提示" className="keyboard-nav-pill-wrap">
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="keyboard-nav-pill"
          title="查看极客键盘快捷键 (?)"
          aria-label="查看快捷键"
        >
          <Keyboard className="w-3.5 h-3.5 text-blue-500" />
          <span>快捷键</span>
          <kbd className="keyboard-nav-kbd">?</kbd>
        </button>
      </aside>

      {/* Help Modal */}
      {showHelp && (
        <div
          className="keyboard-modal-backdrop"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="keyboard-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="极客键盘快捷键手册"
          >
            <div className="keyboard-modal-header">
              <div className="keyboard-modal-title">
                <Keyboard className="w-4 h-4 text-accent" />
                <span>极客阅读与系统操作快捷键</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="keyboard-modal-close"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="keyboard-modal-body">
              <div className="keyboard-shortcut-row">
                <div className="keyboard-key-group">
                  <kbd>J</kbd> / <kbd>K</kbd>
                </div>
                <div className="keyboard-shortcut-desc">
                  <strong>平滑跳转下一节 / 上一节</strong>
                  <p>在文章的所有 H2 / H3 核心章节之间快速滚动导航</p>
                </div>
              </div>

              <div className="keyboard-shortcut-row">
                <div className="keyboard-key-group">
                  <kbd>[</kbd> / <kbd>]</kbd>
                </div>
                <div className="keyboard-shortcut-desc">
                  <strong>翻页上一篇 / 下一篇</strong>
                  <p>在同系列专题文章或时间线相邻博文之间无缝切页</p>
                </div>
              </div>

              <div className="keyboard-shortcut-row">
                <div className="keyboard-key-group">
                  <kbd>T</kbd> 或 <kbd>Ctrl + `</kbd>
                </div>
                <div className="keyboard-shortcut-desc">
                  <strong>唤起虚拟 Web 终端</strong>
                  <p>在浏览器中模拟执行 kubectl、free、bpftool 与 Linux 内核命令</p>
                </div>
              </div>

              <div className="keyboard-shortcut-row">
                <div className="keyboard-key-group">
                  <kbd>Cmd + K</kbd>
                </div>
                <div className="keyboard-shortcut-desc">
                  <strong>全局指令面板 (Command Palette)</strong>
                  <p>全站快速搜索、随机漫游长文、跳转专栏与交互沙盒</p>
                </div>
              </div>

              <div className="keyboard-shortcut-row">
                <div className="keyboard-key-group">
                  <kbd>?</kbd>
                </div>
                <div className="keyboard-shortcut-desc">
                  <strong>打开 / 关闭本快捷键手册</strong>
                </div>
              </div>
            </div>

            <div className="keyboard-modal-footer">
              <span>ESC 或点击外部区域退出</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
