import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PostMeta } from "./post-meta";
import type { CompiledPost, PostSource, PostSummary } from "@/lib/content/types";
import { tagHref } from "@/lib/site-links";

type CardPost = PostSource | CompiledPost | PostSummary;

export function estimateReadingMinutes(post: CardPost) {
  if ("readingTimeMinutes" in post && typeof post.readingTimeMinutes === "number") {
    return post.readingTimeMinutes;
  }
  if ("body" in post && typeof post.body === "string") {
    return Math.max(1, Math.ceil(post.body.length / 500));
  }
  return 5;
}

export function PostCard({
  post,
  index,
  featured = false,
}: {
  post: CardPost;
  index: number;
  featured?: boolean;
}) {
  return (
    <article className="post-card" data-featured={featured || undefined}>
      <div className="post-card-number" aria-hidden="true">
        {String(index).padStart(2, "0")}
      </div>
      <div className="post-card-content">
        <PostMeta
          meta={post.meta}
          readingTimeMinutes={estimateReadingMinutes(post)}
        />
        <h2>
          <Link href={`/writing/${post.slug}`}>{post.meta.title}</Link>
        </h2>
        <p>{post.meta.description}</p>
        <ul className="tag-list" aria-label="文章标签">
          {post.meta.tags.slice(0, 4).map((tag) => (
            <li key={tag}>
              <Link href={tagHref(tag)}>{tag}</Link>
            </li>
          ))}
          {post.meta.tags.length > 4 && (
            <li className="tag-more" title={`还有 ${post.meta.tags.slice(4).join("、")}`}>
              <span>+{post.meta.tags.length - 4}</span>
            </li>
          )}
        </ul>
      </div>
      <span className="post-card-arrow" aria-hidden="true">
        <ArrowUpRight size={16} />
      </span>
    </article>
  );
}
