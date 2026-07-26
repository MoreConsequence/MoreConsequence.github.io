import type { CompiledPost, PostSource } from "@/lib/content/types";
import { PostCard } from "./post-card";

type ListPost = PostSource | CompiledPost;

export function groupPostsByYear(posts: ListPost[]) {
  const groups = new Map<string, ListPost[]>();

  for (const post of posts) {
    const year = post.meta.publishedAt.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), post]);
  }

  return [...groups].map(([year, yearPosts]) => ({
    year,
    posts: yearPosts,
  }));
}

export function PostList({ posts }: { posts: ListPost[] }) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">∅</span>
        <h2>这里暂时还没有文章</h2>
        <p>新的思考正在整理，稍后再来看看。</p>
      </div>
    );
  }

  return (
    <div className="archive-groups">
      {groupPostsByYear(posts).map((group) => (
        <section className="archive-group" key={group.year}>
          <div className="archive-year">
            <span>{group.year}</span>
            <small>{group.posts.length} 篇</small>
          </div>
          <div className="archive-posts">
            {group.posts.map((post, index) => (
              <PostCard key={post.slug} post={post} index={index + 1} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
