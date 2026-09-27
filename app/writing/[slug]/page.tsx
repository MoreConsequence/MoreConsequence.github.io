import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleBody } from "@/components/post/article-body";
import { PostMeta } from "@/components/post/post-meta";
import { ReadingProgress } from "@/components/post/reading-progress";
import { ArticleSidebar } from "@/components/post/article-sidebar";
import { getSeriesIcon } from "@/lib/content/series";
import { getPostBySlug, getPostSources } from "@/lib/content/posts";
import { getPostsForSeries } from "@/lib/content/series";
import { seriesHref } from "@/lib/site-links";
import {
  getArticleNeighbors,
  getRelatedPosts,
} from "@/lib/content/related";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getPostSources().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostSources().find((item) => item.slug === slug);
  if (!post) return {};

  return {
    title: post.meta.title,
    description: post.meta.description,
    alternates: {
      canonical: `/writing/${post.slug}`,
    },
    openGraph: {
      type: "article",
      title: post.meta.title,
      description: post.meta.description,
      publishedTime: post.meta.publishedAt,
      modifiedTime: post.meta.updatedAt,
      tags: post.meta.tags,
      images: ["/og.png"],
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  const allPosts = getPostSources();
  const seriesPosts = post.meta.series
    ? getPostsForSeries(allPosts, post.meta.series)
    : [];
  const isSeries = seriesPosts.length > 1;
  const currentSeriesIndex = isSeries
    ? seriesPosts.findIndex((item) => item.slug === slug)
    : -1;
  const prevChapter = isSeries && currentSeriesIndex > 0
    ? seriesPosts[currentSeriesIndex - 1]
    : undefined;
  const nextChapter = isSeries && currentSeriesIndex >= 0 && currentSeriesIndex < seriesPosts.length - 1
    ? seriesPosts[currentSeriesIndex + 1]
    : undefined;

  // 非系列文章走通用按发布时间翻页
  const neighbors = !isSeries ? getArticleNeighbors(allPosts, slug) : { newer: undefined, older: undefined };
  const related = getRelatedPosts(allPosts, post, 3);

  return (
    <>
      <ReadingProgress />
      <article className="article-page">
        <header className="article-header">
          <div className="article-kicker">
            <Link href="/writing">文章</Link>
            <span>/</span>
            {post.meta.series ? (
              <>
                <Link href={seriesHref(post.meta.series)} className="kicker-series">
                  {getSeriesIcon(post.meta.series)} {post.meta.series}
                  {isSeries ? (
                    <span className="kicker-chapter">
                      （{String(currentSeriesIndex + 1).padStart(2, "0")}/{seriesPosts.length}）
                    </span>
                  ) : null}
                </Link>
                <span>/</span>
              </>
            ) : null}
            <span>{post.meta.tags[0]}</span>
          </div>
          <h1>{post.meta.title}</h1>
          <p className="article-deck">{post.meta.description}</p>
          <div className="article-header-meta">
            <PostMeta
              meta={post.meta}
              readingTimeMinutes={post.readingTimeMinutes}
            />
            {post.meta.updatedAt ? (
              <span>更新于 {post.meta.updatedAt.replaceAll("-", ".")}</span>
            ) : null}
          </div>
        </header>

        <ReadingProgress />

        <div className="article-layout">
          <ArticleSidebar
            items={post.toc}
            series={post.meta.series}
            seriesPosts={seriesPosts}
            currentSlug={post.slug}
            currentSeriesIndex={currentSeriesIndex}
            seriesIcon={post.meta.series ? getSeriesIcon(post.meta.series) : "📚"}
            seriesHrefUrl={post.meta.series ? seriesHref(post.meta.series) : ""}
          />
          <ArticleBody html={post.html} />
        </div>

        <nav className="article-neighbors" aria-label="相邻文章">
          <div className="neighbor-cell">
            {isSeries ? (
              prevChapter ? (
                <Link href={`/writing/${prevChapter.slug}`}>
                  <small>上一章 · 第 {String(currentSeriesIndex).padStart(2, "0")} 篇</small>
                  <span>{prevChapter.meta.title}</span>
                  <time>{prevChapter.meta.publishedAt.replaceAll("-", ".")}</time>
                </Link>
              ) : null
            ) : neighbors.newer ? (
              <Link href={`/writing/${neighbors.newer.slug}`}>
                <small>上一篇</small>
                <span>{neighbors.newer.meta.title}</span>
                <time>{neighbors.newer.meta.publishedAt.replaceAll("-", ".")}</time>
              </Link>
            ) : null}
          </div>
          <div className="neighbor-cell">
            {isSeries ? (
              nextChapter ? (
                <Link href={`/writing/${nextChapter.slug}`}>
                  <small>下一章 · 第 {String(currentSeriesIndex + 2).padStart(2, "0")} 篇</small>
                  <span>{nextChapter.meta.title}</span>
                  <time>{nextChapter.meta.publishedAt.replaceAll("-", ".")}</time>
                </Link>
              ) : null
            ) : neighbors.older ? (
              <Link href={`/writing/${neighbors.older.slug}`}>
                <small>下一篇</small>
                <span>{neighbors.older.meta.title}</span>
                <time>{neighbors.older.meta.publishedAt.replaceAll("-", ".")}</time>
              </Link>
            ) : null}
          </div>
        </nav>

        {related.length ? (
          <section className="related-posts">
            <p className="eyebrow">Continue reading</p>
            <h2>沿着这个问题继续</h2>
            <div>
              {related.map((item) => (
                <Link key={item.slug} href={`/writing/${item.slug}`}>
                  <span className="related-tags" aria-label="文章标签">
                    {item.meta.tags.map((tag) => (
                      <span className="related-tag" key={tag}>{tag}</span>
                    ))}
                  </span>
                  <strong>{item.meta.title}</strong>
                  <time>{item.meta.publishedAt.replaceAll("-", ".")}</time>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </>
  );
}
