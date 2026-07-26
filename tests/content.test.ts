import { describe, expect, it } from "vitest";
import path from "node:path";
import * as postPipeline from "@/lib/content/posts";
import {
  filterPublished,
  getPostSources,
  parsePostSource,
  sortPosts,
} from "@/lib/content/posts";
import { compileMarkdown } from "@/lib/content/markdown";

const article = `---
title: "理解 Go Context 的边界"
description: "把取消信号放回它应该在的位置。"
publishedAt: "2026-07-20"
tags: ["Go", "并发"]
featured: true
---

## 为什么需要 Context

正文。

### 取消不是清理

\`\`\`go
select {
case <-ctx.Done():
  return ctx.Err()
}
\`\`\`
`;

describe("Markdown content pipeline", () => {
  it("discovers repository Markdown with a portable filesystem loader", () => {
    expect(postPipeline).toHaveProperty("readPostSources");

    const posts = postPipeline.readPostSources(
      path.join(process.cwd(), "content", "posts"),
      "production",
    );

    expect(posts.map((post) => post.slug)).toEqual([
      "building-a-markdown-blog",
      "understanding-context-switching-from-cpu-to-goroutines",
      "go-context-patterns",
      "understanding-event-loops",
    ]);
    expect(getPostSources("production")).toEqual(posts);
    expect(posts.every((post) => !post.meta.draft)).toBe(true);
  });

  it("parses and validates frontmatter", () => {
    const post = parsePostSource("go-context.md", article);

    expect(post.slug).toBe("go-context");
    expect(post.meta.title).toBe("理解 Go Context 的边界");
    expect(post.meta.publishedAt).toBe("2026-07-20");
  });

  it("rejects incomplete frontmatter", () => {
    expect(() =>
      parsePostSource(
        "broken.md",
        `---
title: "缺少摘要"
publishedAt: "2026-07-20"
tags: ["测试"]
---
`,
      ),
    ).toThrow(/broken\.md/);
  });

  it("rejects impossible calendar dates", () => {
    expect(() =>
      parsePostSource(
        "bad-date.md",
        article.replace("2026-07-20", "2026-99-99"),
      ),
    ).toThrow(/publishedAt/);
  });

  it("sorts newest posts first", () => {
    const oldPost = parsePostSource(
      "old.md",
      article.replace("2026-07-20", "2026-01-01"),
    );
    const newPost = parsePostSource(
      "new.md",
      article.replace("2026-07-20", "2026-07-25"),
    );

    expect(sortPosts([oldPost, newPost]).map((post) => post.slug)).toEqual([
      "new",
      "old",
    ]);
  });

  it("hides drafts in production", () => {
    const published = parsePostSource("published.md", article);
    const draft = parsePostSource(
      "draft.md",
      article.replace("featured: true", "featured: false\ndraft: true"),
    );

    expect(filterPublished([published, draft], "production")).toEqual([
      published,
    ]);
    expect(filterPublished([published, draft], "development")).toHaveLength(2);
  });

  it("compiles headings, reading time and highlighted code", async () => {
    const result = await compileMarkdown(article.split("---\n").at(-1) ?? "");

    expect(result.toc.map((item) => item.id)).toEqual([
      "为什么需要-context",
      "取消不是清理",
    ]);
    expect(result.readingTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(result.html).toContain('id="为什么需要-context"');
    expect(result.html).toContain("shiki");
  });

  it("uses the final HTML heading ids in the table of contents", async () => {
    const result = await compileMarkdown("# 重复标题\n\n## 重复标题");

    expect(result.toc).toEqual([
      { id: "重复标题-1", title: "重复标题", depth: 2 },
    ]);
    expect(result.html).toContain('id="重复标题-1"');
  });

  it("keeps footnote accessibility headings out of the visible TOC", async () => {
    const result = await compileMarkdown(
      "## 正文章节\n\n这里有一条脚注。[^1]\n\n[^1]: 脚注内容。",
    );

    expect(result.toc).toEqual([
      { id: "正文章节", title: "正文章节", depth: 2 },
    ]);
    expect(result.html).toContain('class="sr-only"');
    expect(result.html).not.toContain('href="#footnote-label"');
  });
});
