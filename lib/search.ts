import Fuse from "fuse.js";
import type { CompiledPost } from "./content/types";

export type SearchDocument = {
  slug: string;
  title: string;
  series?: string;
  description: string;
  tags: string[];
  publishedAt: string;
  text: string;
};

export function buildSearchIndex(posts: CompiledPost[]): SearchDocument[] {
  return posts
    .filter((post) => !post.meta.draft)
    .map((post) => {
      const headings = (post.toc || []).map((item) => item.title).join(" ");
      const snippet = (post.plainText || "")
        .slice(0, 1000)
        .replace(/\s+/g, " ")
        .trim();
      const text = headings ? `${headings} ${snippet}` : snippet;

      return {
        slug: post.slug,
        title: post.meta.title,
        series: post.meta.series ?? "",
        description: post.meta.description,
        tags: post.meta.tags,
        publishedAt: post.meta.publishedAt,
        text,
      };
    });
}

export function searchPosts(documents: SearchDocument[], query: string) {
  const normalized = query.trim();
  if (!normalized) return documents.slice(0, 5);

  return new Fuse(documents, {
    threshold: 0.36,
    ignoreLocation: true,
    keys: [
      { name: "title", weight: 0.38 },
      { name: "series", weight: 0.22 },
      { name: "tags", weight: 0.2 },
      { name: "description", weight: 0.12 },
      { name: "text", weight: 0.08 },
    ],
  })
    .search(normalized, { limit: 8 })
    .map((result) => result.item);
}
