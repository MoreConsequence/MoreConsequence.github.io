import type { PostSource } from "./types";

export type TagSummary = {
  name: string;
  count: number;
  latestPublishedAt: string;
};

export function collectTags(posts: PostSource[]): TagSummary[] {
  const tags = new Map<string, TagSummary>();

  posts.forEach((post) => {
    post.meta.tags.forEach((name) => {
      const current = tags.get(name);
      tags.set(name, {
        name,
        count: (current?.count ?? 0) + 1,
        latestPublishedAt:
          current?.latestPublishedAt &&
          current.latestPublishedAt > post.meta.publishedAt
            ? current.latestPublishedAt
            : post.meta.publishedAt,
      });
    });
  });

  return [...tags.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.latestPublishedAt.localeCompare(a.latestPublishedAt) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
}

export function decodeTag(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getPostsForTag(posts: PostSource[], tag: string) {
  const normalized = decodeTag(tag).toLocaleLowerCase("zh-CN");
  return posts.filter((post) =>
    post.meta.tags.some(
      (postTag) => postTag.toLocaleLowerCase("zh-CN") === normalized,
    ),
  );
}
