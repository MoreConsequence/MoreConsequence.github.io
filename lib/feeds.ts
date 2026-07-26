import type { CompiledPost } from "./content/types";
import { siteConfig } from "./site";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function publishedPosts(posts: CompiledPost[]) {
  return posts.filter((post) => !post.meta.draft);
}

export function normalizeSiteUrl(url: string) {
  return url.replace(/\/$/, "");
}

export function createRobotsTxt(siteUrl: string) {
  return `User-agent: *
Allow: /

Sitemap: ${normalizeSiteUrl(siteUrl)}/sitemap.xml
`;
}

export function createRssXml(posts: CompiledPost[], siteUrl: string) {
  const origin = normalizeSiteUrl(siteUrl);
  const items = publishedPosts(posts)
    .map((post) => {
      const url = `${origin}/writing/${post.slug}`;
      const html = post.html.replaceAll("]]>", "]]]]><![CDATA[>");
      return `<item>
  <title>${escapeXml(post.meta.title)}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <description>${escapeXml(post.meta.description)}</description>
  <pubDate>${new Date(`${post.meta.publishedAt}T00:00:00Z`).toUTCString()}</pubDate>
  <content:encoded><![CDATA[${html}]]></content:encoded>
</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${escapeXml(siteConfig.name)}</title>
  <link>${origin}</link>
  <description>${escapeXml(siteConfig.description)}</description>
  <language>zh-CN</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${items}
</channel>
</rss>`;
}

export function createSitemapXml(posts: CompiledPost[], siteUrl: string) {
  const origin = normalizeSiteUrl(siteUrl);
  const staticPaths = ["", "/writing", "/tags", "/about"];
  const urls = [
    ...staticPaths.map((path) => ({
      loc: `${origin}${path || "/"}`,
      lastmod: posts[0]?.meta.updatedAt ?? posts[0]?.meta.publishedAt,
    })),
    ...publishedPosts(posts).map((post) => ({
      loc: `${origin}/writing/${post.slug}`,
      lastmod: post.meta.updatedAt ?? post.meta.publishedAt,
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ({ loc, lastmod }) =>
      `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>`;
}
