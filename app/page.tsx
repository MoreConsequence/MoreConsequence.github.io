import Link from "next/link";
import { PostCard } from "@/components/post/post-card";
import { getAllPosts } from "@/lib/content/posts";

export default async function Home() {
  const posts = await getAllPosts();
  const featured = posts.filter((post) => post.meta.featured).slice(0, 2);
  const latest = posts.slice(0, 3);
  const tags = [...new Set(posts.flatMap((post) => post.meta.tags))].slice(0, 8);
  const seriesCount = new Set(
    posts.map((post) => post.meta.series).filter(Boolean),
  ).size;
  const charCount = posts.reduce((sum, post) => sum + post.plainText.length, 0);

  const stats = [
    { value: String(posts.length), label: "POSTS" },
    { value: (charCount / 10000).toFixed(1) + "W", label: "CHARS" },
    { value: String(tags.length), label: "TOPICS" },
    { value: String(seriesCount), label: "SERIES" },
  ];

  return (
    <>
      <section className="home-hero">
        <div className="hero-inner">
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="hero-eyebrow">
                Software / Systems / Durable ideas
              </p>
              <h1>
                <span className="hero-line">在复杂系统里，</span>
                <span className="hero-line hero-line-accent">
                  寻找清晰的边界。
                </span>
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
            <aside className="hero-panel">
              <div className="hero-panel-head">
                <span className="panel-led" aria-hidden="true" />
                <strong>SYSTEM</strong> / STATUS
              </div>
              <dl className="panel-stats">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.value}</dt>
                    <dd>{stat.label}</dd>
                  </div>
                ))}
              </dl>
              <div className="panel-note">
                <strong>当前关注</strong>
                <p>Agent 工程 · Go 服务设计 · 让工具服务于思考</p>
              </div>
              <span className="panel-scan" aria-hidden="true" />
            </aside>
          </div>
        </div>
        <div className="hero-spec" aria-hidden="true">
          <span><b>SYSTEM ONLINE</b></span>
          <i>│</i>
          <span>{posts.length} POSTS</span>
          <i>│</i>
          <span>GO / JS / SYSTEMS / AGENTS</span>
          <i>│</i>
          <span>EST. 2026</span>
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span className="section-index">01</span> Editor&apos;s selection</p>
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
            <p className="eyebrow"><span className="section-index">02</span> Recently published</p>
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
        <div className="topic-band-inner">
          <div>
            <p className="eyebrow"><span className="section-index">03</span> Browse by subject</p>
            <h2 id="topic-title">沿着主题继续</h2>
          </div>
          <div className="topic-links">
            {tags.map((tag, index) => (
              <Link key={tag} href={"/tags/" + encodeURIComponent(tag)}>
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

