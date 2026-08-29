import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { compileMarkdown } from "./markdown";
import { postMetaSchema } from "./schema";
import type { CompiledPost, PostSource } from "./types";

const postsDirectory = path.join(process.cwd(), "content", "posts");

export function parsePostSource(filename: string, source: string): PostSource {
  const slug = filename.replace(/\.md$/, "");
  const match = source.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  );
  const frontmatter = match?.[1];
  if (!frontmatter) {
    throw new Error(`文章 ${filename} 缺少由 --- 包围的 Frontmatter`);
  }

  let data: unknown;
  try {
    data = parseYaml(frontmatter);
  } catch (error) {
    throw new Error(
      `文章 ${filename} 的 Frontmatter 无法解析：${
        error instanceof Error ? error.message : "未知错误"
      }`,
    );
  }
  const content = source.slice(match[0].length);
  const parsed = postMetaSchema.safeParse(data);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`文章 ${filename} 的 Frontmatter 无效：${details}`);
  }

  return {
    slug,
    meta: parsed.data,
    body: content.trim(),
  };
}

export function sortPosts(posts: PostSource[]) {
  return [...posts].sort(
    (a, b) =>
      b.meta.publishedAt.localeCompare(a.meta.publishedAt) ||
      a.slug.localeCompare(b.slug),
  );
}

export function filterPublished(
  posts: PostSource[],
  environment = process.env.NODE_ENV,
) {
  return environment === "production"
    ? posts.filter((post) => !post.meta.draft)
    : posts;
}

function collectMarkdownFiles(dir: string): { filename: string; fullPath: string }[] {
  const results: { filename: string; fullPath: string }[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push({ filename: entry.name, fullPath });
    }
  }

  return results;
}

export function readPostSources(
  directory: string,
  environment = process.env.NODE_ENV,
) {
  const files = collectMarkdownFiles(directory);
  const posts = files.map(({ filename, fullPath }) =>
    parsePostSource(filename, readFileSync(fullPath, "utf8")),
  );

  return sortPosts(filterPublished(posts, environment));
}

export function getPostSources(environment = process.env.NODE_ENV) {
  return readPostSources(postsDirectory, environment);
}

export async function getAllPosts(
  environment = process.env.NODE_ENV,
): Promise<CompiledPost[]> {
  const cacheKey = environment ?? "development";
  const cached = compiledPostCache.get(cacheKey);
  if (cached) return cached;

  const compilation = Promise.all(
    getPostSources(environment).map(async (post) => ({
      ...post,
      ...(await compileMarkdown(post.body)),
    })),
  );
  compiledPostCache.set(cacheKey, compilation);
  return compilation;
}

export async function getPostBySlug(slug: string) {
  const posts = await getAllPosts();
  return posts.find((post) => post.slug === slug);
}

const compiledPostCache = new Map<string, Promise<CompiledPost[]>>();
