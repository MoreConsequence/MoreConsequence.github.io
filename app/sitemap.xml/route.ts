import { getAllPosts } from "@/lib/content/posts";
import { createSitemapXml } from "@/lib/feeds";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const posts = await getAllPosts("production");

  return new Response(createSitemapXml(posts, siteConfig.url), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
