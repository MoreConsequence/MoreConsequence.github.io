import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostList } from "@/components/post/post-list";
import { getAllPosts, getPostSources } from "@/lib/content/posts";
import { collectTags, decodeTag, getPostsForTag } from "@/lib/content/tags";
import { encodeRouteSegment } from "@/lib/site-links";

type PageProps = {
  params: Promise<{ tag: string }>;
};

export async function generateStaticParams() {
  const tags = collectTags(getPostSources());
  return tags.map((tag) => ({ tag: encodeRouteSegment(tag.name) }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const tag = decodeTag((await params).tag);
  return {
    title: `${tag} 主题`,
    description: `浏览所有关于 ${tag} 的技术文章。`,
  };
}

export default async function TagPage({ params }: PageProps) {
  const tag = decodeTag((await params).tag);
  const posts = getPostsForTag(await getAllPosts(), tag);

  if (!posts.length) notFound();

  return (
    <div className="archive-page">
      <header className="tag-page-header">
        <Link href="/tags/">← 所有标签</Link>
        <p className="eyebrow">Topic / {posts.length} essays</p>
        <h1>{tag}</h1>
        <p>围绕这个主题的全部记录，按发布时间由新到旧排列。</p>
      </header>
      <PostList posts={posts} />
    </div>
  );
}
