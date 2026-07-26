import { describe, expect, it } from "vitest";
import * as feedPipeline from "@/lib/feeds";
import { createRssXml, createSitemapXml } from "@/lib/feeds";
import type { CompiledPost } from "@/lib/content/types";
import { siteConfig } from "@/lib/site";

const makePost = (slug: string, draft = false): CompiledPost => ({
  slug,
  body: "正文",
  html: "<p>正文</p>",
  plainText: "正文",
  toc: [],
  readingTimeMinutes: 1,
  meta: {
    title: slug === "published" ? "发布 & 验证" : "草稿",
    description: "一段 <摘要>",
    publishedAt: "2026-07-26",
    tags: ["工程"],
    draft,
    featured: false,
  },
});

describe("feeds and discovery", () => {
  const posts = [makePost("published"), makePost("draft", true)];

  it("creates valid RSS with escaped text and canonical article URLs", () => {
    const xml = createRssXml(posts, "https://blog.example.com");

    expect(xml).toContain("<rss");
    expect(xml).toContain("发布 &amp; 验证");
    expect(xml).toContain("https://blog.example.com/writing/published");
    expect(xml).not.toContain("/writing/draft");
  });

  it("excludes drafts from sitemap", () => {
    const xml = createSitemapXml(posts, "https://blog.example.com");

    expect(xml).toContain("<loc>https://blog.example.com/writing/published</loc>");
    expect(xml).not.toContain("/writing/draft");
  });

  it("uses the canonical GitHub Pages URL for production discovery files", () => {
    expect(siteConfig.url).toBe("https://moreconsequence.github.io");

    expect(createRssXml(posts, siteConfig.url)).toContain(
      "<link>https://moreconsequence.github.io</link>",
    );
    expect(createSitemapXml(posts, siteConfig.url)).toContain(
      "<loc>https://moreconsequence.github.io/</loc>",
    );
    expect(feedPipeline).toHaveProperty("createRobotsTxt");
    expect(feedPipeline.createRobotsTxt(siteConfig.url)).toContain(
      "Sitemap: https://moreconsequence.github.io/sitemap.xml",
    );
  });
});
