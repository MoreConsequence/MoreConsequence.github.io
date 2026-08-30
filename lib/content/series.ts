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
  return posts
    .filter((post) => post.meta.series === normalized)
    .sort(
      (a, b) =>
        a.meta.publishedAt.localeCompare(b.meta.publishedAt) ||
        a.slug.localeCompare(b.slug),
    );
}

export function getSeriesIcon(seriesName: string): string {
  if (/内核|eBPF|Linux/i.test(seriesName)) return "🐧";
  if (/共识|容错|分布式/i.test(seriesName)) return "🏛️";
  if (/CDN|边缘/i.test(seriesName)) return "⚡";
  if (/测速|吞吐/i.test(seriesName)) return "🚀";
  if (/Pi|Agent|智能体/i.test(seriesName)) return "🤖";
  if (/Go的|Go设计/i.test(seriesName)) return "🐹";
  if (/系统设计|架构/i.test(seriesName)) return "🏗️";
  if (/数据库|存储/i.test(seriesName)) return "🗄️";
  if (/TypeScript|从 Go 到/i.test(seriesName)) return "🔄";
  if (/底层原理|造轮子/i.test(seriesName)) return "⚙️";
  if (/协议|浏览器/i.test(seriesName)) return "📡";
  if (/AI|大模型|LLM/i.test(seriesName)) return "🔮";
  return "🏷️";
}

