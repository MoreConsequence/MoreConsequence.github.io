import { createRobotsTxt } from "@/lib/feeds";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  return new Response(createRobotsTxt(siteConfig.url), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
