import type { PostSource } from "./types";
import { decodeRouteSegment } from "@/lib/site-links";

export type SeriesSummary = {
  name: string;
  count: number;
  latestPublishedAt: string;
};

export function collectSeries(posts: PostSource[]): SeriesSummary[] {
  const series = new Map<string, SeriesSummary>();

  posts.forEach((post) => {
    if (!post.meta.series) return;
    const current = series.get(post.meta.series);
    series.set(post.meta.series, {
      name: post.meta.series,
      count: (current?.count ?? 0) + 1,
      latestPublishedAt:
        current?.latestPublishedAt &&
        current.latestPublishedAt > post.meta.publishedAt
          ? current.latestPublishedAt
          : post.meta.publishedAt,
    });
  });

  return [...series.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.latestPublishedAt.localeCompare(a.latestPublishedAt) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
}

export function decodeSeries(value: string) {
  return decodeRouteSegment(value);
}

export function getPostsForSeries(posts: PostSource[], series: string) {
  const normalized = decodeSeries(series);
  return posts.filter((post) => post.meta.series === normalized);
}
