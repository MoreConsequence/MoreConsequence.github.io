import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleBody } from "@/components/post/article-body";
import { TableOfContents } from "@/components/post/table-of-contents";
import { getArticleNeighbors, getRelatedPosts } from "@/lib/content/related";
import { parsePostSource } from "@/lib/content/posts";

const makePost = (slug: string, date: string, tags: string[], series?: string) =>
  parsePostSource(
    `${slug}.md`,
    `---
title: "${slug}"
description: "${slug} 的摘要"
publishedAt: "${date}"
tags: ${JSON.stringify(tags)}
${series ? `series: "${series}"` : ""}
---

正文。
`,
  );

describe("article experience", () => {
  const posts = [
    makePost("newest", "2026-07-26", ["Go", "架构"]),
    makePost("current", "2026-07-20", ["Go"]),
    makePost("older", "2026-07-10", ["JavaScript"]),
  ];

  it("finds chronological neighbors", () => {
    expect(getArticleNeighbors(posts, "current")).toEqual({
      newer: posts[0],
      older: posts[2],
    });
  });

  it("ranks related posts by shared tags", () => {
    expect(getRelatedPosts(posts, posts[1]!, 2).map((post) => post.slug)).toEqual(
      ["newest", "older"],
    );
  });

  it("puts same-series posts ahead of tag matches", () => {
    const series = [
      makePost("series-a", "2026-06-10", ["Go"], "测试系列"),
      makePost("current", "2026-06-21", ["Go", "系列：测试"], "测试系列"),
      makePost("series-b", "2026-06-30", ["Go"], "测试系列"),
      makePost("tag-hit", "2026-07-01", ["Go", "系列：测试"]),
    ];
    const result = getRelatedPosts(series, series[1]!, 3);
    expect(result.map((post) => post.slug)).toEqual([
      "series-b",
      "series-a",
      "tag-hit",
    ]);
  });

  it("renders compiled article HTML and an accessible contents list", () => {
    const bodyHtml = renderToStaticMarkup(
      <ArticleBody html={'<h2 id="edge">边界</h2><p>正文</p>'} />,
    );
    const tocHtml = renderToStaticMarkup(
      <TableOfContents
        items={[
          { id: "edge", title: "边界", depth: 2 },
          { id: "details", title: "细节", depth: 3 },
        ]}
      />,
    );

    expect(bodyHtml).toContain('<h2 id="edge">');
    expect(tocHtml).toContain('href="#edge"');
    expect(tocHtml).toContain("本文目录");
  });
});
