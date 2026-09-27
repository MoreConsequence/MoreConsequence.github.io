import type { PostMeta as PostMetaData } from "@/lib/content/types";
import { Badge } from "@/components/ui/badge";

export function formatPostDate(date: string) {
  return date.replaceAll("-", ".");
}

export function PostMeta({
  meta,
  readingTimeMinutes,
}: {
  meta: PostMetaData;
  readingTimeMinutes: number;
}) {
  return (
    <div className="post-meta">
      <time dateTime={meta.publishedAt}>
        {formatPostDate(meta.publishedAt)}
      </time>
      <span aria-hidden="true">/</span>
      <span>{readingTimeMinutes} 分钟阅读</span>
      {meta.series ? (
        <>
          <span aria-hidden="true">/</span>
          <Badge variant="series" size="sm" dot>
            {meta.series}
          </Badge>
        </>
      ) : null}
    </div>
  );
}
