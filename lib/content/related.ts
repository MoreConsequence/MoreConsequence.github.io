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
  limit = 2,
) {
  const currentTags = new Set(current.meta.tags);

  return posts
    .filter((post) => post.slug !== current.slug)
    .map((post, index) => ({
      post,
      index,
      score: post.meta.tags.filter((tag) => currentTags.has(tag)).length,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ post }) => post);
}
