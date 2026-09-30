"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getNextSearchSelection } from "./search-navigation";
import { useSearch } from "./use-search";

export function SearchDialog() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLAnchorElement | HTMLDivElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { query, setQuery, results, loading, error, documents } = useSearch(isOpen);

  const quickActions = [
    {
      id: "action-terminal",
      icon: ">_",
      title: "唤起虚拟内核终端 (WebTerminal)",
      desc: "在浏览器中模拟执行 kubectl、uname、bpftool 与 free 等指令",
      run: () => {
        window.dispatchEvent(
          new CustomEvent("terminal-exec", {
            detail: { command: "kubectl get nodes" },
          })
        );
      },
    },
    {
      id: "action-random",
      icon: "🎲",
      title: "随机漫游一篇架构长文",
      desc: "从全站 1740+ 篇深度技术博文中随机抽取阅读",
      run: () => {
        if (documents && documents.length > 0) {
          const randomIndex = Math.floor(Math.random() * documents.length);
          const chosen = documents[randomIndex];
          if (chosen) {
            router.push(`/writing/${chosen.slug}`);
          }
        }
      },
    },
    {
      id: "action-series",
      icon: "📚",
      title: "核心专题系列 (Series)",
      desc: "探索系统级专栏：Linux 内核、K8s 架构、分布式共识等",
      run: () => router.push("/series"),
    },
    {
      id: "action-sandboxes",
      icon: "⚡",
      title: "交互式工程沙盒 (Playgrounds)",
      desc: "在线体验 PagedAttention、TC Pacing、Raft 等系统模拟器",
      run: () => router.push("/playground"),
    },
    {
      id: "action-tags",
      icon: "🏷️",
      title: "全站技术标签 (Tags)",
      desc: "按技术栈索引：高并发、eBPF、内存管理、架构设计",
      run: () => router.push("/tags"),
    },
  ];

  const open = useCallback(() => {
    dialogRef.current?.showModal();
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(-1);
  }, [setQuery]);

  const selectWithArrowKey = (key: "ArrowDown" | "ArrowUp") => {
    const totalCount = query ? results.length : quickActions.length;
    const nextIndex = getNextSearchSelection(
      selectedIndex,
      key,
      totalCount,
    );
    setSelectedIndex(nextIndex);
    window.requestAnimationFrame(() => {
      resultRefs.current[nextIndex]?.scrollIntoView({ block: "nearest" });
    });
  };

  useEffect(() => {
    const handleOpen = () => open();
    const handleKeys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialogRef.current?.open) close();
        else open();
      }
    };

    window.addEventListener("open-blog-search", handleOpen);
    window.addEventListener("keydown", handleKeys);
    return () => {
      window.removeEventListener("open-blog-search", handleOpen);
      window.removeEventListener("keydown", handleKeys);
    };
  }, [close, open]);

  return (
    <dialog
      ref={dialogRef}
      className="search-dialog"
      aria-label="全局指令与文章搜索"
      onClose={() => setIsOpen(false)}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <div className="search-panel">
        <div className="search-input-row">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                selectWithArrowKey(event.key);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (query && results.length > 0) {
                  const targetIndex = selectedIndex < 0 ? 0 : selectedIndex;
                  resultRefs.current[targetIndex]?.click();
                } else if (!query) {
                  const targetIndex = selectedIndex < 0 ? 0 : selectedIndex;
                  const action = quickActions[targetIndex];
                  if (action) {
                    action.run();
                    close();
                  }
                }
              }
            }}
            placeholder="搜索文章、标签或输入指令 (如 K8s, eBPF)…"
            aria-label="搜索关键词"
            aria-controls="blog-search-results"
            aria-activedescendant={
              selectedIndex >= 0
                ? `blog-search-result-${selectedIndex}`
                : undefined
            }
          />
          <button type="button" onClick={close} aria-label="关闭搜索">
            ESC
          </button>
        </div>

        <div
          id="blog-search-results"
          className="search-results"
          role="listbox"
          aria-label="搜索结果"
          aria-live="polite"
        >
          {loading ? <p className="search-state">正在整理索引…</p> : null}
          {error ? (
            <p className="search-state">
              搜索索引暂时没有准备好，请稍后再试。
            </p>
          ) : null}

          {/* 当搜索词为空时展示全局快捷指令 (Command Palette) */}
          {!loading && !query && (
            <div className="search-quick-actions">
              <div className="search-section-label">快捷指令与导航</div>
              {quickActions.map((action, index) => (
                <div
                  key={action.id}
                  id={`blog-search-result-${index}`}
                  ref={(node) => {
                    resultRefs.current[index] = node;
                  }}
                  role="option"
                  aria-selected={selectedIndex === index}
                  className={`search-action-item ${
                    selectedIndex === index ? "is-selected" : ""
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    action.run();
                    close();
                  }}
                >
                  <span className="search-action-icon">{action.icon}</span>
                  <div className="search-action-content">
                    <strong>{action.title}</strong>
                    <p>{action.desc}</p>
                  </div>
                  <kbd className="search-action-kbd">↵</kbd>
                </div>
              ))}
            </div>
          )}

          {!loading && query && results.length === 0 ? (
            <p className="search-state">
              没有找到“{query}”。试试更短的关键词或标签。
            </p>
          ) : null}

          {!loading &&
            query &&
            results.map((result, index) => (
              <Link
                key={result.slug}
                id={`blog-search-result-${index}`}
                ref={(node) => {
                  resultRefs.current[index] = node;
                }}
                href={`/writing/${result.slug}`}
                role="option"
                aria-selected={selectedIndex === index}
                className={selectedIndex === index ? "is-selected" : undefined}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={close}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{result.title}</strong>
                  <p>{result.description}</p>
                  <small>
                    {result.series
                      ? `《${result.series}》 · ${result.tags.join(" · ")}`
                      : result.tags.join(" · ")}
                  </small>
                </div>
                <time>{result.publishedAt.replaceAll("-", ".")}</time>
              </Link>
            ))}
        </div>

        <footer className="search-footer">
          <span>↑↓ 选择</span>
          <span>ENTER 执行/打开</span>
          <span>ESC 关闭</span>
        </footer>
      </div>
    </dialog>
  );
}
