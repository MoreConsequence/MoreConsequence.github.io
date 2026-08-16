import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostList } from "@/components/post/post-list";
import { getAllPosts } from "@/lib/content/posts";
import { collectSeries, decodeSeries, getPostsForSeries } from "@/lib/content/series";

type PageProps = {
  params: Promise<{ series: string }>;
};

export async function generateStaticParams() {
  const series = collectSeries(await getAllPosts("production"));
  return series.map((item) => ({ series: item.name }));
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
    <div className="archive-page">
      <header className="tag-page-header">
        <Link href="/series">← 所有系列</Link>
        <p className="eyebrow">Series / {posts.length} essays</p>
        <h1>{name}</h1>
        <p>这条路线上的全部记录，按发布时间由新到旧排列。</p>
      </header>
      <PostList posts={posts} />
    </div>
  );
}