import { getAllPosts } from "@/lib/content/posts";
import { createRssXml } from "@/lib/feeds";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const posts = await getAllPosts("production");

  return new Response(createRssXml(posts, siteConfig.url), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
