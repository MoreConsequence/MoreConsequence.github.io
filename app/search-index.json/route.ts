import { getAllPosts } from "@/lib/content/posts";
import { buildSearchIndex } from "@/lib/search";

export const dynamic = "force-static";

export async function GET() {
  const posts = await getAllPosts("production");

  return Response.json(buildSearchIndex(posts), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
