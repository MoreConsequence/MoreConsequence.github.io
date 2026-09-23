import type { PostSource } from "./types";
import { decodeRouteSegment } from "@/lib/site-links";
import { TOP_CURATED_TAGS } from "./taxonomy";

export type TagSummary = {
  name: string;
  count: number;
  latestPublishedAt: string;
};

export function collectTags(posts: PostSource[]): TagSummary[] {
  const tags = new Map<string, TagSummary>();

  posts.forEach((post) => {
    post.meta.tags.forEach((name) => {
      const current = tags.get(name);
      tags.set(name, {
        name,
        count: (current?.count ?? 0) + 1,
        latestPublishedAt:
          current?.latestPublishedAt &&
          current.latestPublishedAt > post.meta.publishedAt
            ? current.latestPublishedAt
            : post.meta.publishedAt,
      });
    });
  });

  return [...tags.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.latestPublishedAt.localeCompare(a.latestPublishedAt) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
}

export function collectCuratedTags(posts: PostSource[]): TagSummary[] {
  const allTags = collectTags(posts);
  const curatedSet = new Set(TOP_CURATED_TAGS.map((t) => t.toLowerCase()));
  return allTags.filter((t) => curatedSet.has(t.name.toLowerCase()));
}

export type AlphabeticalTagGroup = {
  letter: string;
  tags: TagSummary[];
};

export function groupTagsAlphabetically(tags: TagSummary[]): AlphabeticalTagGroup[] {
  const map = new Map<string, TagSummary[]>();

  tags.forEach((tag) => {
    const firstChar = tag.name.charAt(0).toUpperCase();
    // 区分字母与非字母（中文等统一归入其拼音或 # 组）
    let groupKey = "#";
    if (/[A-Z]/.test(firstChar)) {
      groupKey = firstChar;
    } else {
      if (tag.name.startsWith("Go")) groupKey = "G";
      else if (tag.name.startsWith("Node")) groupKey = "N";
      else if (tag.name.startsWith("Type")) groupKey = "T";
      else if (tag.name.startsWith("Linux")) groupKey = "L";
      else groupKey = "核心技术";
    }

    if (!map.has(groupKey)) {
      map.set(groupKey, []);
    }
    map.get(groupKey)!.push(tag);
  });

  return [...map.entries()]
    .map(([letter, groupTags]) => ({
      letter,
      tags: groupTags.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => a.letter.localeCompare(b.letter));
}

export function decodeTag(value: string) {
  return decodeRouteSegment(value);
}

export function getPostsForTag(posts: PostSource[], tag: string) {
  const normalized = decodeTag(tag).toLocaleLowerCase("zh-CN");
  return posts.filter((post) =>
    post.meta.tags.some(
      (postTag) => postTag.toLocaleLowerCase("zh-CN") === normalized,
    ),
  );
}
