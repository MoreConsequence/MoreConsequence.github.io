import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeriesCurriculum } from "@/components/post/series-curriculum";
import { getAllPosts, getPostSources } from "@/lib/content/posts";
import { collectSeries, decodeSeries, getPostsForSeries } from "@/lib/content/series";
import { encodeRouteSegment } from "@/lib/site-links";

type PageProps = {
  params: Promise<{ series: string }>;
};

export async function generateStaticParams() {
  const series = collectSeries(getPostSources());
  return series.map((item) => ({ series: encodeRouteSegment(item.name) }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const name = decodeSeries((await params).series);
  return {
    title: `${name} 系列`,
    description: `按阅读顺序浏览「${name}」系列的全部文章。`,
  };
}

export default async function SeriesDetailPage({ params }: PageProps) {
  const name = decodeSeries((await params).series);
  const posts = getPostsForSeries(await getAllPosts(), name);

  if (!posts.length) notFound();

  return (
    <div className="archive-page series-detail-page">
      <header className="tag-page-header">
        <Link href="/series/">← 所有专栏系列</Link>
        <p className="eyebrow">Series Track / {posts.length} Chapters</p>
        <h1>{name}</h1>
        <p>专栏路线完整目录，按章节阅读顺序由前至后排列（共 {posts.length} 篇）。</p>
      </header>
      <SeriesCurriculum seriesName={name} posts={posts} />
    </div>
  );
}
