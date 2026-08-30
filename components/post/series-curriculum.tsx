import Link from "next/link";
import type { CompiledPost, PostSource } from "@/lib/content/types";
import { getSeriesIcon } from "@/lib/content/series";
import { tagHref } from "@/lib/site-links";

type ListPost = PostSource | CompiledPost;

function estimateReadingMinutes(post: ListPost) {
  if ("readingTimeMinutes" in post) {
    return post.readingTimeMinutes;
  }
  return Math.max(1, Math.ceil(post.body.length / 500));
}

export function SeriesCurriculum({
  seriesName,
  posts,
}: {
  seriesName: string;
  posts: ListPost[];
}) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">∅</span>
        <h2>该系列暂时还没有文章</h2>
      </div>
    );
  }

  return (
    <div className="series-curriculum-container">
      <div className="series-curriculum-meta-bar">
        <span className="series-curriculum-badge">{getSeriesIcon(seriesName)} 《{seriesName}》专栏路线</span>
        <span className="series-curriculum-count">已连载 {posts.length} 个核心章节 · 建议按 01 至 {String(posts.length).padStart(2, "0")} 循序研读</span>
      </div>

      <ol className="series-curriculum-list">
        {posts.map((post, index) => {
          const chapterNum = String(index + 1).padStart(2, "0");
          const readingMinutes = estimateReadingMinutes(post);

          return (
            <li key={post.slug} className="series-curriculum-item">
              <div className="series-curriculum-spine">
                <span className="series-curriculum-index">{chapterNum}</span>
                {index < posts.length - 1 ? <div className="series-curriculum-line" /> : null}
              </div>

              <div className="series-curriculum-card">
                <div className="series-curriculum-card-header">
                  <span className="series-chapter-pill">第 {chapterNum} 篇</span>
                  <span className="series-read-time">{readingMinutes} 分钟精读</span>
                  <time className="series-card-date">{post.meta.publishedAt.replaceAll("-", ".")}</time>
                </div>

                <h2 className="series-curriculum-title">
                  <Link href={`/writing/${post.slug}`}>{post.meta.title}</Link>
                </h2>

                <p className="series-curriculum-desc">{post.meta.description}</p>

                <div className="series-curriculum-footer">
                  <ul className="tag-list" aria-label="章节标签">
                    {post.meta.tags.map((tag) => (
                      <li key={tag}>
                        <Link href={tagHref(tag)}>{tag}</Link>
                      </li>
                    ))}
                  </ul>

                  <Link className="series-enter-btn" href={`/writing/${post.slug}`}>
                    研读本章 <span>→</span>
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
