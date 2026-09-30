import Link from "next/link";
import { PostCard } from "@/components/post/post-card";
import { Button, Badge, Card, SectionHeading } from "@/components/ui";
import { getPostSources } from "@/lib/content/posts";
import { getAllPillars, getPostPillarId } from "@/lib/content/taxonomy";
import { tagHref } from "@/lib/site-links";

export default async function Home() {
  const posts = getPostSources();
  const featured = posts.filter((post) => post.meta.featured).slice(0, 2);
  const latest = posts.slice(0, 4);

  // 统计板块文章数量
  const pillars = getAllPillars();
  const pillarCounts = posts.reduce(
    (acc, p) => {
      const pid = getPostPillarId(p.slug, p.meta.series, p.meta.tags);
      acc[pid] = (acc[pid] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const seriesCount = new Set(
    posts.map((post) => post.meta.series).filter(Boolean),
  ).size;
  const charCount = posts.reduce((sum, post) => sum + post.body.length, 0);

  const stats = [
    { value: String(posts.length), label: "POSTS" },
    { value: (charCount / 10000).toFixed(1) + "W", label: "CHARS" },
    { value: "5", label: "PILLARS" },
    { value: String(seriesCount), label: "SERIES" },
  ];

  const featuredTags = [
    "系统设计",
    "分布式系统",
    "LLM",
    "Agent",
    "Go",
    "Linux内核",
    "eBPF",
    "网络协议",
    "IoT Platform",
    "高并发",
    "数据库",
    "TypeScript",
  ];

  return (
    <>
      {/* 首页大头 Hero 区域 */}
      <section className="home-hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-eyebrow">Boundary Notes · 持续深度写作</p>
            <h1>
              <span className="hero-line">在复杂系统里，</span>
              <span className="hero-line hero-line-accent">
                寻找清晰的边界。
              </span>
            </h1>
          </div>
          <div className="hero-rail">
            <p className="hero-intro">
              这里记录软件工程、分布式系统、大模型基础设施与系统底层的长期工程判断。拒绝浮躁追新，专注经得住时间考验的架构规律。
            </p>
            <div className="hero-actions">
              <Button href="/writing" variant="primary" size="lg">
                开始阅读 <span aria-hidden="true">↗</span>
              </Button>
              <Button href="/series" variant="ghost" size="lg">
                浏览系列专题
              </Button>
            </div>
          </div>
          <dl className="hero-stats" aria-label="站点统计">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.value}</dt>
                <dd>{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 核心重构亮点：五大技术知识支柱全景板块 */}
      <section className="home-section pillars-section">
        <SectionHeading
          index="01"
          eyebrow="Engineering Pillars"
          title="核心技术版图"
          description={`全站 ${posts.length} 篇深度长文收敛于五大核心支柱。从应用层智能体到网卡驱动内核，层层递进。`}
        />

        <div className="pillars-grid">
          {pillars.map((pillar) => {
            const count = pillarCounts[pillar.id] ?? 0;
            return (
              <Card
                key={pillar.id}
                href="/writing"
                hoverable
                className="pillar-card"
                data-pillar={pillar.id}
              >
                <div className="pillar-card-header">
                  <span className="pillar-icon" aria-hidden="true">
                    {pillar.icon}
                  </span>
                  <Badge variant="series" size="sm">
                    {count} 篇长文
                  </Badge>
                </div>
                <div className="pillar-card-body">
                  <h3>{pillar.name}</h3>
                  <span className="pillar-en">{pillar.nameEn}</span>
                  <p>{pillar.description}</p>
                </div>
                <div className="pillar-card-footer">
                  <div className="pillar-topics">
                    {pillar.keyTopics.slice(0, 4).map((topic) => (
                      <Badge key={topic} variant="topic" size="sm">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                  <span className="pillar-arrow" aria-hidden="true">
                    进入板块 →
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 本期精选 */}
      <section className="home-section">
        <SectionHeading
          index="02"
          eyebrow="Editor's selection"
          title="本期精选"
          description="从最近的文章中，选出更值得反复细读的深度长文。"
        />
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

      {/* 最近发布 */}
      <section className="home-section latest-section">
        <SectionHeading
          index="03"
          eyebrow="Recently published"
          title="最新发布"
          action={
            <Button href="/writing" variant="link" size="sm">
              全部文章归档 →
            </Button>
          }
        />
        <div className="latest-list">
          {latest.map((post, index) => (
            <PostCard key={post.slug} post={post} index={index + 1} />
          ))}
        </div>
      </section>

      {/* 核心主题入口 */}
      <section className="topic-band" aria-labelledby="topic-title">
        <div className="topic-band-inner">
          <SectionHeading
            index="04"
            eyebrow="Core Topics"
            title="核心技术主题"
            id="topic-title"
          />
          <div className="topic-links">
            {featuredTags.map((tag, index) => (
              <Link key={tag} href={tagHref(tag)}>
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
