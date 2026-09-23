import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/content/posts";
import { collectSeries, collectSeriesByPillar, getSeriesIcon } from "@/lib/content/series";
import { seriesHref } from "@/lib/site-links";

export const metadata: Metadata = {
  title: "文章系列",
  description: "按五大核心技术支柱浏览循序渐进的系统化系列专栏。",
};

export default async function SeriesPage() {
  const posts = await getAllPosts();
  const allSeries = collectSeries(posts);
  const pillarGroups = collectSeriesByPillar(posts);

  return (
    <div className="series-hub-page">
      <header className="page-intro">
        <p className="eyebrow">Series / {allSeries.length} tracks across 5 pillars</p>
        <h1>体系化系列专栏</h1>
        <p>
          一篇文章解决一个具体问题，一个系列穿透一个工程领域。全站专栏按五大核心技术支柱结构化归集。
        </p>

        {/* 顶部板块锚点导航 */}
        <nav className="pillar-anchor-nav" aria-label="支柱快速跳转">
          {pillarGroups.map((group) => (
            <a key={group.pillar.id} href={`#${group.pillar.id}`} className="pillar-anchor-link">
              <span>{group.pillar.icon}</span>
              <span>{group.pillar.name}</span>
              <small>({group.totalPosts}篇)</small>
            </a>
          ))}
        </nav>
      </header>

      {/* 按五大支柱分栏排版 */}
      <div className="pillar-series-sections">
        {pillarGroups.map((group) => (
          <section key={group.pillar.id} id={group.pillar.id} className="pillar-series-section">
            <div className="pillar-section-header">
              <div className="pillar-title-group">
                <span className="pillar-section-icon" aria-hidden="true">
                  {group.pillar.icon}
                </span>
                <div>
                  <h2>{group.pillar.name}</h2>
                  <span className="pillar-subtitle-en">{group.pillar.nameEn}</span>
                </div>
              </div>
              <div className="pillar-meta-badge">
                <span>{group.series.length} 个系列</span>
                <span className="badge-divider">/</span>
                <span>{group.totalPosts} 篇长文</span>
              </div>
            </div>

            <p className="pillar-section-desc">{group.pillar.description}</p>

            <div className="series-grid">
              {group.series.map((item, index) => (
                <Link
                  key={item.name}
                  href={seriesHref(item.name)}
                  className="series-card"
                >
                  <div className="series-card-top">
                    <span className="series-index-num">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="series-post-count">{item.count} 篇文章</span>
                  </div>
                  <h3 className="series-card-title">
                    <span className="series-icon" aria-hidden="true">
                      {getSeriesIcon(item.name)}
                    </span>
                    {item.name}
                  </h3>
                  <div className="series-card-footer">
                    <time>更新于 {item.latestPublishedAt.replaceAll("-", ".")}</time>
                    <span className="series-arrow">阅读系列 →</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
