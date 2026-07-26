import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PostCard } from "@/components/post/post-card";
import { groupPostsByYear } from "@/components/post/post-list";
import { parsePostSource } from "@/lib/content/posts";

const makePost = (slug: string, date: string, featured = false) =>
  parsePostSource(
    `${slug}.md`,
    `---
title: "${slug} 标题"
description: "一段足够清楚的中文摘要。"
publishedAt: "${date}"
tags: ["架构", "测试"]
featured: ${featured}
---

正文。
`,
  );

describe("post listings", () => {
  it("groups posts by year while preserving order", () => {
    const groups = groupPostsByYear([
      makePost("new", "2026-07-26"),
      makePost("older", "2025-12-20"),
      makePost("oldest", "2025-01-02"),
    ]);

    expect(groups.map((group) => group.year)).toEqual(["2026", "2025"]);
    expect(groups[1]?.posts.map((post) => post.slug)).toEqual([
      "older",
      "oldest",
    ]);
  });

  it("renders metadata readers need before opening a post", () => {
    const html = renderToStaticMarkup(
      <PostCard post={makePost("event-loop", "2026-07-12", true)} index={1} />,
    );

    expect(html).toContain('href="/writing/event-loop"');
    expect(html).toContain("event-loop 标题");
    expect(html).toContain("2026.07.12");
    expect(html).toContain("架构");
    expect(html).toContain("分钟");
  });
});
