"use client";

import { Search } from "lucide-react";

export function CommandTrigger() {
  return (
    <button
      className="command-trigger"
      type="button"
      aria-label="打开全站搜索"
      onClick={() => window.dispatchEvent(new CustomEvent("open-blog-search"))}
    >
      <Search size={17} aria-hidden="true" />
      <span>搜索</span>
      <kbd>Ctrl / ⌘ K</kbd>
    </button>
  );
}
