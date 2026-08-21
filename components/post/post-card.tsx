import Link from "next/link";
import { PostMeta } from "./post-meta";
import type { CompiledPost, PostSource } from "@/lib/content/types";
import { tagHref } from "@/lib/site-links";

function estimateReadingMinutes(post: PostSource | CompiledPost) {
  if ("readingTimeMinutes" in post) {
    return post.readingTimeMinutes;
  }
  return Math.max(1, Math.ceil(post.body.length / 500));
}

export function PostCard({
  post,
  index,
  featured = false,
}: {
  post: PostSource | CompiledPost;
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
          {post.meta.tags.map((tag) => (
           <li key={tag}>
              <Link href={tagHref(tag)}>{tag}</Link>
           </li>
          ))}
        </ul>
      </div>
      <span className="post-card-arrow" aria-hidden="true">
        ↗
      </span>
    </article>
  );
}
