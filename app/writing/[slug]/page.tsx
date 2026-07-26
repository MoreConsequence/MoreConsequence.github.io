import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleBody } from "@/components/post/article-body";
import { PostMeta } from "@/components/post/post-meta";
import { ReadingControls } from "@/components/post/reading-controls";
import { ReadingProgress } from "@/components/post/reading-progress";
import { TableOfContents } from "@/components/post/table-of-contents";
import { getAllPosts, getPostSources } from "@/lib/content/posts";
import {
  getArticleNeighbors,
  getRelatedPosts,
} from "@/lib/content/related";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getPostSources("production").map((post) => ({ slug: post.slug }));
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

  const neighbors = getArticleNeighbors(posts, slug);
  const related = getRelatedPosts(posts, post, 2);

  return (
    <>
      <ReadingProgress />
      <article className="article-page">
        <header className="article-header">
          <div className="article-kicker">
            <Link href="/writing">文章</Link>
            <span>/</span>
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
          </aside>
          <ArticleBody html={post.html} />
          <aside className="reading-aside">
            <ReadingControls />
          </aside>
        </div>

        <nav className="article-neighbors" aria-label="相邻文章">
          {neighbors.newer ? (
            <Link href={`/writing/${neighbors.newer.slug}`}>
              <small>上一篇 / NEWER</small>
              <span>{neighbors.newer.meta.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {neighbors.older ? (
            <Link href={`/writing/${neighbors.older.slug}`}>
              <small>下一篇 / OLDER</small>
              <span>{neighbors.older.meta.title}</span>
            </Link>
          ) : null}
        </nav>

        {related.length ? (
          <section className="related-posts">
            <p className="eyebrow">Continue reading</p>
            <h2>沿着这个问题继续</h2>
            <div>
              {related.map((item) => (
                <Link key={item.slug} href={`/writing/${item.slug}`}>
                  <span>{item.meta.tags[0]}</span>
                  <strong>{item.meta.title}</strong>
                  <small>↗</small>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </>
  );
}
