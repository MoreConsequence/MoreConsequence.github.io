import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PostCard } from "@/components/post/post-card";
import { groupPostsByYear } from "@/components/post/post-list";
import { parsePostSource } from "@/lib/content/posts";
import { seriesHref, tagHref } from "@/lib/site-links";

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
    expect(html).toContain('class="post-card-arrow"');
  });

 it("keeps secondary tag links static-export safe", () => {
    expect(tagHref("架构")).toBe("/tags/x-~E6~9E~B6~E6~9E~84/");
    expect(tagHref("测试")).toBe("/tags/x-~E6~B5~8B~E8~AF~95/");
    expect(seriesHref("Go 的设计边界")).toBe(
      "/series/x-Go~20~E7~9A~84~E8~AE~BE~E8~AE~A1~E8~BE~B9~E7~95~8C/",
    );
 });
});
