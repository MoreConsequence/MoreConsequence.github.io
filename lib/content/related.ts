import type { PostSource } from "./types";

export function getArticleNeighbors(posts: PostSource[], slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);
  return {
    newer: index > 0 ? posts[index - 1] : undefined,
    older: index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}

export function getRelatedPosts(
  posts: PostSource[],
  current: PostSource,
  limit = 3,
) {
  const currentTags = new Set(current.meta.tags);
  const series = current.meta.series;

  return posts
    .filter((post) => post.slug !== current.slug)
    .map((post, index) => {
      // 系列内文章优先，其次同标签重合度，最后按时间序保底
      let score = 0;
      if (series && post.meta.series === series) score += 100;
      score += post.meta.tags.filter((tag) => currentTags.has(tag)).length;
      return { post, index, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.post.meta.publishedAt.localeCompare(a.post.meta.publishedAt) ||
        a.index - b.index,
    )
    .slice(0, limit)
    .map(({ post }) => post);
}
