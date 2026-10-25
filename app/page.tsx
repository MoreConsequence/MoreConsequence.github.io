import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Compass, Cpu, Database, Globe, Terminal } from "lucide-react";
import { PostCard } from "@/components/post/post-card";
import { Button } from "@/components/ui";
import { getPostSources } from "@/lib/content/posts";
import { getAllPillars, getPostPillarId } from "@/lib/content/taxonomy";
import { tagHref } from "@/lib/site-links";

const pillarIcons = {
  "ai-systems": Cpu,
  "distributed-systems": Database,
  "kernel-performance": Terminal,
  "network-iot": Globe,
  "architecture-practice": Compass,
};

const pillarSummaries = {
  "ai-systems": "从推理引擎到智能体编排，理解计算、上下文与执行的边界。",
  "distributed-systems": "共识、复制与存储引擎：让状态经得起故障。",
  "kernel-performance": "走进调度、内存与 I/O，沿着真实调用路径理解性能。",
  "network-iot": "从协议到设备控制，连接数据平面与云端系统。",
  "architecture-practice": "把机制变成设计判断，把边界落到接口与代码。",
};

export default async function Home() {
  const posts = getPostSources();
  const featured = posts.filter((post) => post.meta.featured).slice(0, 2);
  const latest = posts.slice(0, 4);
  const pillars = getAllPillars();
  const pillarCounts = posts.reduce((acc, post) => {
    const id = getPostPillarId(post.slug, post.meta.series, post.meta.tags);
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const seriesCount = new Set(posts.map((post) => post.meta.series).filter(Boolean)).size;
  const featuredTags = ["系统设计", "分布式系统", "LLM", "Agent", "Go", "Linux内核", "eBPF", "网络协议", "IoT Platform", "高并发", "数据库", "TypeScript"];

  return (
    <>
      <section className="home-hero">
        {/* 数学与技术之美：高维流形测地线与高斯波包向量曲线群 (Parametric Math Curves) */}
        <div className="hero-math-bg" aria-hidden="true">
          <svg className="hero-math-svg" viewBox="0 0 1200 480" fill="none">
            <defs>
              <linearGradient id="mathCurveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.0" />
                <stop offset="25%" stopColor="var(--accent)" stopOpacity="0.22" />
                <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.30" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="mathCurveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.0" />
                <stop offset="35%" stopColor="#6366f1" stopOpacity="0.25" />
                <stop offset="75%" stopColor="var(--accent)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="mathCurveGrad3" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.0" />
                <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* 高斯钟形正态分布流线 (Gaussian Envelope) */}
            <path
              d="M 60 420 C 300 420, 480 400, 680 210 C 820 70, 920 60, 1060 210 C 1140 290, 1170 380, 1200 420"
              stroke="url(#mathCurveGrad1)"
              strokeWidth="1.5"
              strokeDasharray="8 6"
            />

            {/* 傅里叶频域波包谐波 (Harmonic Waveform) */}
            <path
              d="M 0 340 C 220 220, 420 440, 640 280 C 820 150, 1020 320, 1200 240"
              stroke="url(#mathCurveGrad2)"
              strokeWidth="1.5"
            />

            {/* 微分几何测地流形线 (Geodesic Manifold Flow) */}
            <path
              d="M 40 290 C 280 390, 520 180, 740 320 C 960 440, 1080 200, 1200 310"
              stroke="url(#mathCurveGrad1)"
              strokeWidth="1.2"
              opacity="0.7"
            />

            {/* 欧拉螺线与衰减包络辅线 (Euler Damped Wave) */}
            <path
              d="M 0 380 C 320 350, 580 310, 800 240 C 980 180, 1100 230, 1200 200"
              stroke="url(#mathCurveGrad3)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />

            {/* 极值点与流形切线微坐标 (Tangent Coordinates & Nodes) */}
            <circle cx="680" cy="210" r="3.5" fill="var(--accent)" opacity="0.6" />
            <circle cx="820" cy="70" r="4.5" fill="var(--accent)" opacity="0.8" />
            <circle cx="920" cy="60" r="3.5" fill="#3b82f6" opacity="0.7" />
            <circle cx="1060" cy="210" r="3.5" fill="var(--accent)" opacity="0.6" />
            <line x1="760" y1="65" x2="980" y2="65" stroke="var(--accent)" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.4" />
          </svg>
        </div>

        <div className="hero-inner">
          <div className="hero-stage-grid">
            <div className="hero-copy">
              <div className="hero-kicker-badge">
                <span className="hero-kicker-dot" aria-hidden="true" />
                <span className="hero-kicker-text">系统工程 · 架构边界 · 深度实践</span>
              </div>
              <h1>
                <span className="hero-line">在复杂系统里，</span>
                <span className="hero-line hero-line-accent">寻找清晰的边界。</span>
              </h1>
              <p className="hero-intro">
                记录软件工程、分布式系统、大模型基础设施与系统底层的长期工程判断。拒绝浮躁追新，专注经得住时间考验的架构规律。
              </p>
              <div className="hero-actions">
                <Button href="/writing" variant="primary" size="lg">
                  开始阅读 <ArrowUpRight size={18} aria-hidden="true" />
                </Button>
                <Button href="/series" variant="ghost" size="lg">浏览系列专题</Button>
              </div>
            </div>

            {/* 右侧：纯粹的工程手记（自然水平并列，无死板卡片外框） */}
            <div className="hero-journal">
              <div className="hero-journal-ambient" aria-hidden="true" />
              <div className="hero-journal-wrapper">
                <Image
                  src="/images/boundary-journal-hero.webp"
                  alt="边界笔记的工程手记封面视觉"
                  width={880}
                  height={880}
                  priority
                  className="hero-journal-cover"
                />
              </div>
            </div>
          </div>

          {/* 底部：横跨左右栏的精工 HUD 状态栏 */}
          <div className="hero-note" aria-label="全站概览与统计">
            <p className="hero-note-statement">
              写关于软件、系统，以及长期有效的工程判断。
            </p>
            <div className="hero-note-metrics">
              <Link href="/writing" className="note-metric-item">
                <strong>{posts.length}</strong> <span>篇深度长文</span>
              </Link>
              <span className="note-metric-sep" aria-hidden="true" />
              <Link href="/series" className="note-metric-item">
                <strong>{seriesCount}</strong> <span>个系列专题</span>
              </Link>
              <span className="note-metric-sep" aria-hidden="true" />
              <Link href="/rss.xml" className="note-metric-item note-metric-rss">
                RSS 订阅
              </Link>
            </div>
          </div>
        </div>
      </section>


      {featured.length > 0 && (
        <section className="home-section selection-section" aria-labelledby="selection-title">
          <div className="section-heading">
            <div><h2 id="selection-title">值得细读</h2></div>
            <p>选出更值得反复细读的深度长文。</p>
          </div>
          <div className="featured-grid">
            {featured.map((post, index) => <PostCard key={post.slug} post={post} index={index + 1} featured />)}
          </div>
        </section>
      )}

      <section className="home-section pillars-section" aria-labelledby="pillars-title">
        <div className="section-heading">
          <div><h2 id="pillars-title">探索技术版图</h2></div>
          <p>五个方向，沿着具体问题深入系统内部。</p>
        </div>
        <div className="system-atlas">
          {pillars.map((pillar, index) => {
            const Icon = pillarIcons[pillar.id];
            return (
              <Link key={pillar.id} href={"/writing?pillar=" + pillar.id} className="system-entry" data-pillar={pillar.id}>
                <div className="system-entry-copy">
                  <div className="system-entry-meta">
                    <span className="entry-index-pill">
                      <Icon size={16} strokeWidth={2} aria-hidden="true" />
                      <strong>{String(index + 1).padStart(2, "0")}</strong>
                    </span>
                    <span className="entry-count-pill">{pillarCounts[pillar.id] ?? 0} 篇深度长文</span>
                  </div>
                  <h3>{pillar.name}</h3>
                  <p>{pillarSummaries[pillar.id]}</p>
                  <div className="system-entry-footer">
                    <div className="entry-topics-row">
                      {pillar.keyTopics.slice(0, 4).map((topic) => (
                        <span key={topic} className="entry-topic-tag">{topic}</span>
                      ))}
                    </div>
                    <span className="entry-arrow-box" aria-hidden="true">
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="home-section latest-section" aria-labelledby="latest-title">
        <div className="section-heading">
          <div><h2 id="latest-title">最新发布</h2></div>
          <Button href="/writing" variant="link" size="sm">查看全部文章</Button>
        </div>
        <div className="latest-list">
          {latest.map((post, index) => <PostCard key={post.slug} post={post} index={index + 1} />)}
        </div>
      </section>

      <section className="topic-band" aria-labelledby="topic-title">
        <div className="topic-band-inner">
          <div className="section-heading"><div><h2 id="topic-title">从一个主题开始</h2></div></div>
          <div className="topic-links">
            {featuredTags.map((tag) => <Link key={tag} href={tagHref(tag)}>{tag}</Link>)}
          </div>
        </div>
      </section>
    </>
  );
}
