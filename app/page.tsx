import Link from "next/link";
import { PostCard } from "@/components/post/post-card";
import { getAllPosts } from "@/lib/content/posts";

export default async function Home() {
  const posts = await getAllPosts();
  const featured = posts.filter((post) => post.meta.featured).slice(0, 2);
  const latest = posts.slice(0, 3);
  const tags = [...new Set(posts.flatMap((post) => post.meta.tags))].slice(0, 8);

  return (
    <>
      <section className="home-hero">
        <div className="hero-index" aria-hidden="true">
          VOL. 01 <span>/</span> 2026
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Software / Systems / Durable ideas</p>
          <h1>
            在复杂系统里，
            <br />
            寻找<span>清晰的边界。</span>
          </h1>
          <p className="hero-intro">
            这里记录软件工程、系统设计与工具实践。比起追逐每一次更新，我更关心那些经得住时间的判断。
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/writing">
              开始阅读 <span aria-hidden="true">↗</span>
            </Link>
            <Link className="text-link" href="/about">
              认识作者
            </Link>
          </div>
        </div>
        <aside className="hero-note">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>当前关注</strong>
            <p>Agent 工程、Go 服务设计，以及让工具真正服务于思考。</p>
          </div>
        </aside>
        <div className="hero-deco" aria-hidden="true">
          <span>THINK</span>
          <span>BUILD</span>
          <span>WRITE</span>
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Editor&apos;s selection</p>
            <h2>本期精选</h2>
          </div>
          <p>从最近的文章中，选出两篇更值得慢慢读的长文。</p>
        </div>
        <div className="featured-grid">
          {featured.map((post, index) => (
            <PostCard
              key={post.slug}
              post={post}
              index={index + 1}
              featured
            />
          ))}
        </div>
      </section>

      <section className="home-section latest-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recently published</p>
            <h2>最近发布</h2>
          </div>
          <Link className="text-link" href="/writing">
            全部文章 →
          </Link>
        </div>
        <div className="latest-list">
          {latest.map((post, index) => (
            <PostCard key={post.slug} post={post} index={index + 1} />
          ))}
        </div>
      </section>

      <section className="topic-band" aria-labelledby="topic-title">
        <p className="eyebrow">Browse by subject</p>
        <div className="topic-band-inner">
          <h2 id="topic-title">沿着主题继续</h2>
          <div className="topic-links">
            {tags.map((tag, index) => (
              <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {tag}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
