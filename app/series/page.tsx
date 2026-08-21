import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/content/posts";
import { collectSeries } from "@/lib/content/series";
import { seriesHref } from "@/lib/site-links";

export const metadata: Metadata = {
  title: "文章系列",
  description: "按系列浏览循序渐进的深度专题。",
};

export default async function SeriesPage() {
  const posts = await getAllPosts();
  const series = collectSeries(posts);

  return (
    <div className="tags-page">
      <header className="page-intro">
        <p className="eyebrow">Series / {series.length} tracks</p>
        <h1>文章系列</h1>
        <p>
          一篇文章讲清一个问题，一个系列讲透一个领域。按阅读顺序进入任意一条路线。
        </p>
      </header>
      <div className="tag-index">
        {series.map((item, index) => (
          <Link
            key={item.name}
            href={seriesHref(item.name)}
          >
            <span className="tag-index-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong>{item.name}</strong>
            <span>{item.count} 篇文章</span>
            <time>{item.latestPublishedAt.replaceAll("-", ".")}</time>
          </Link>
        ))}
      </div>
    </div>
  );
}
