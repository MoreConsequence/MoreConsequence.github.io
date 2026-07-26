import Fuse from "fuse.js";
import type { CompiledPost } from "./content/types";

export type SearchDocument = {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  text: string;
};

export function buildSearchIndex(posts: CompiledPost[]): SearchDocument[] {
  return posts
    .filter((post) => !post.meta.draft)
    .map((post) => ({
      slug: post.slug,
      title: post.meta.title,
      description: post.meta.description,
      tags: post.meta.tags,
      publishedAt: post.meta.publishedAt,
      text: post.plainText,
    }));
}

export function searchPosts(documents: SearchDocument[], query: string) {
  const normalized = query.trim();
  if (!normalized) return documents.slice(0, 5);

  return new Fuse(documents, {
    threshold: 0.36,
    ignoreLocation: true,
    keys: [
      { name: "title", weight: 0.42 },
      { name: "tags", weight: 0.25 },
      { name: "description", weight: 0.2 },
      { name: "text", weight: 0.13 },
    ],
  })
    .search(normalized, { limit: 8 })
    .map((result) => result.item);
}
