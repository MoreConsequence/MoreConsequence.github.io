import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleBody } from "@/components/post/article-body";
import { PostMeta } from "@/components/post/post-meta";
import { ReadingProgress } from "@/components/post/reading-progress";
import { TableOfContents } from "@/components/post/table-of-contents";
import { getAllPosts, getPostSources } from "@/lib/content/posts";
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
  const post = (await getAllPosts()).find((item) => item.slug === slug);
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
  const posts = await getAllPosts();
  const post = posts.find((item) => item.slug === slug);

  if (!post) notFound();

  const seriesPosts = post.meta.series
    ? getPostsForSeries(posts, post.meta.series)
    : [];
  // 系列文章按系列顺序翻页，非系列按发布时间翻页
  const isSeries = seriesPosts.length > 1;
  const navPool = isSeries ? seriesPosts : posts;
  const neighbors = getArticleNeighbors(navPool, slug);
  const related = getRelatedPosts(posts, post, 3);

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
                <Link href={seriesHref(post.meta.series)}>
                  {post.meta.series}
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

        <div className="article-layout">
          <aside className="article-aside">
            <TableOfContents items={post.toc} />
            {seriesPosts.length > 1 ? (
              <div className="article-fact">
                <p>
                  <Link href={seriesHref(post.meta.series!)}>
                    系列：{post.meta.series}
                  </Link>
                </p>
                <ol>
                  {seriesPosts.map((item, index) => (
                    <li
                      key={item.slug}
                      data-active={item.slug === post.slug || undefined}
                    >
                      <span className="af-index">
                        {String(seriesPosts.length - index).padStart(2, "0")}
                      </span>
                      {item.slug === post.slug ? (
                        <span className="af-title">{item.meta.title}</span>
                      ) : (
                        <a className="af-title" href={`/writing/${item.slug}`}>
                          {item.meta.title}
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </aside>
          <ArticleBody html={post.html} />
        </div>

        <nav className="article-neighbors" aria-label="相邻文章">
          <div className="neighbor-cell">
            {neighbors.newer ? (
              <Link href={`/writing/${neighbors.newer.slug}`}>
                <small>{isSeries ? "上一章" : "上一篇"}</small>
                <span>{neighbors.newer.meta.title}</span>
                <time>{neighbors.newer.meta.publishedAt.replaceAll("-", ".")}</time>
              </Link>
            ) : null}
          </div>
          <div className="neighbor-cell">
            {neighbors.older ? (
              <Link href={`/writing/${neighbors.older.slug}`}>
                <small>{isSeries ? "下一章" : "下一篇"}</small>
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
