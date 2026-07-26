import { describe, expect, it } from "vitest";
import { collectTags, getPostsForTag } from "@/lib/content/tags";
import { parsePostSource } from "@/lib/content/posts";

const makePost = (slug: string, date: string, tags: string[]) =>
  parsePostSource(
    `${slug}.md`,
    `---
title: "${slug}"
description: "${slug} 摘要"
publishedAt: "${date}"
tags: ${JSON.stringify(tags)}
---

正文。
`,
  );

describe("tag index", () => {
  const posts = [
    makePost("context", "2026-07-26", ["Go", "并发"]),
    makePost("service", "2026-07-20", ["Go", "架构"]),
    makePost("event-loop", "2026-07-10", ["JavaScript"]),
  ];

  it("collects counts and latest dates", () => {
    expect(collectTags(posts)[0]).toEqual({
      name: "Go",
      count: 2,
      latestPublishedAt: "2026-07-26",
    });
  });

  it("matches decoded tag names and returns no posts for unknown tags", () => {
    expect(getPostsForTag(posts, "Go").map((post) => post.slug)).toEqual([
      "context",
      "service",
    ]);
    expect(getPostsForTag(posts, "不存在")).toEqual([]);
  });
});
