import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/content/posts";
import { collectTags } from "@/lib/content/tags";

export const metadata: Metadata = {
  title: "主题标签",
  description: "沿着技术主题浏览文章。",
};

export default async function TagsPage() {
  const posts = await getAllPosts();
  const tags = collectTags(posts);

  return (
    <div className="tags-page">
      <header className="page-intro">
        <p className="eyebrow">Topics / {tags.length} subjects</p>
        <h1>主题标签</h1>
        <p>
          文章并不总属于一条时间线。换一个入口，看看不同问题之间如何彼此连接。
        </p>
      </header>
      <div className="tag-index">
        {tags.map((tag, index) => (
          <Link key={tag.name} href={`/tags/${encodeURIComponent(tag.name)}`}>
            <span className="tag-index-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong>{tag.name}</strong>
            <span>{tag.count} 篇文章</span>
            <time>{tag.latestPublishedAt.replaceAll("-", ".")}</time>
            <i aria-hidden="true">↗</i>
          </Link>
        ))}
      </div>
    </div>
  );
}
