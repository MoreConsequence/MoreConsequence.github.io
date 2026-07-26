"use client";

export function CommandTrigger() {
  return (
    <button
      className="command-trigger"
      type="button"
      aria-label="打开全站搜索"
      onClick={() => window.dispatchEvent(new CustomEvent("open-blog-search"))}
    >
      <span>搜索</span>
      <kbd>⌘ K</kbd>
    </button>
  );
}
