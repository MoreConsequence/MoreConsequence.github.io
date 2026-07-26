"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getNextSearchSelection } from "./search-navigation";
import { useSearch } from "./use-search";

export function SearchDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { query, setQuery, results, loading, error } = useSearch(isOpen);

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
    const nextIndex = getNextSearchSelection(
      selectedIndex,
      key,
      results.length,
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
      aria-label="搜索文章"
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

              if (event.key === "Enter" && results.length > 0) {
                event.preventDefault();
                const targetIndex = selectedIndex < 0 ? 0 : selectedIndex;
                resultRefs.current[targetIndex]?.click();
              }
            }}
            placeholder="搜索标题、标签或正文…"
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
          {!loading && query && results.length === 0 ? (
            <p className="search-state">
              没有找到“{query}”。试试更短的关键词或标签。
            </p>
          ) : null}
          {!loading &&
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
                  <small>{result.tags.join(" · ")}</small>
                </div>
                <time>{result.publishedAt.replaceAll("-", ".")}</time>
              </Link>
            ))}
        </div>
        <footer className="search-footer">
          <span>↑↓ 选择</span>
          <span>ENTER 打开</span>
          <span>ESC 关闭</span>
        </footer>
      </div>
    </dialog>
  );
}
