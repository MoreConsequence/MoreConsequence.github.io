import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchPosts } from "@/lib/search";
import type { CompiledPost } from "@/lib/content/types";

const post = (
  slug: string,
  title: string,
  tags: string[],
  plainText: string,
  draft = false,
): CompiledPost => ({
  slug,
  body: plainText,
  html: `<p>${plainText}</p>`,
  toc: [],
  readingTimeMinutes: 2,
  plainText,
  meta: {
    title,
    description: `${title} 的摘要`,
    publishedAt: "2026-07-26",
    tags,
    draft,
    featured: false,
  },
});

describe("static search", () => {
  const posts = [
    post("go-context", "理解 Go Context", ["Go", "并发"], "取消信号向下传播"),
    post("event-loop", "事件循环不是一个循环", ["JavaScript"], "任务与微任务"),
    post("draft", "未发布手稿", ["内部"], "不能被检索", true),
  ];

  it("keeps published searchable fields and excludes drafts", () => {
    const index = buildSearchIndex(posts);

    expect(index).toHaveLength(2);
    expect(index[0]).toMatchObject({
      slug: "go-context",
      tags: ["Go", "并发"],
    });
  });

  it("matches Chinese title, body and tags", () => {
    const index = buildSearchIndex(posts);

    expect(searchPosts(index, "事件循环")[0]?.slug).toBe("event-loop");
    expect(searchPosts(index, "取消信号")[0]?.slug).toBe("go-context");
    expect(searchPosts(index, "并发")[0]?.slug).toBe("go-context");
  });
});
