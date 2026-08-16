import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "content", "posts");
const files = fs.readdirSync(postsDir).filter((file) => file.endsWith(".md")).sort();
const slugs = new Set(files.map((file) => file.slice(0, -3)));
const weakHeading = /^(?:[一二三四五六七八九十百]+、\s*)?(背景|架构|结果|结论|总结|引言|概述|实现|原理|问题|方案|测试|性能|小结|下一步)$/;
// Ellipses are valid in code excerpts, and "TODO" can be discussed as a concept.
// Flag editorial markers that still ask the reader to wait or the author to finish.
// Drafts may describe an evidence boundary, but should not ship bracketed "fill this later" text.
const placeholder = /\b(?:FIXME|TBD)\b|敬请期待|待终稿|(?:^|[：:，,。\s])TODO(?:[：:，,。\s]|$)|本机实测待补|数字待回填|待回填|待补 evidence/;

const reports = files.map((file) => {
  const source = fs.readFileSync(path.join(postsDir, file), "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { file, errors: ["frontmatter"] };

  const meta = parse(match[1]);
  const body = match[2];
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((item) => item[1].trim());
  const numericHeadings = headings
    .map((heading) => heading.match(/^([一二三四五六七八九十百]+)、/)?.[1])
    .filter(Boolean);
  const internalLinks = [...body.matchAll(/\]\(\/writing\/([a-z0-9-]+)\)/g)].map((item) => item[1]);
  const issues = [];

  if (!meta.title || !meta.description || !meta.publishedAt || !meta.tags) issues.push("frontmatter");
  if (!/\*\*TL;DR：\*\*/.test(body)) issues.push("missing-tldr");
  if (!/^##\s+.*参考资料/m.test(body)) issues.push("missing-references");
  if (headings.some((heading) => weakHeading.test(heading))) issues.push("weak-heading");
  if (numericHeadings.some((heading, index, all) => all.indexOf(heading) !== index)) issues.push("duplicate-heading-number");
  if (internalLinks.some((slug) => !slugs.has(slug))) issues.push("missing-internal-link");
  if (placeholder.test(body)) issues.push("placeholder");

  return {
    file,
    slug: file.slice(0, -3),
    title: meta.title,
    publishedAt: meta.publishedAt,
    draft: meta.draft === true,
    chars: body.length,
    headings: headings.length,
    codeBlocks: (body.match(/```/g) ?? []).length / 2,
    mermaid: (body.match(/```mermaid/g) ?? []).length,
    tables: (body.match(/^\|.*\|$/gm) ?? []).length,
    issues,
  };
});

const counts = Object.fromEntries(
  [...new Set(reports.flatMap((report) => report.issues))]
    .map((issue) => [issue, reports.filter((report) => report.issues.includes(issue)).length]),
);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: reports.length, counts, reports }, null, 2));
} else {
  console.log(`# Content quality audit\n\n- Posts: ${reports.length}\n- Issues: ${JSON.stringify(counts)}\n`);
  for (const report of reports.filter((item) => item.issues.length)) {
    console.log(`- ${report.slug}: ${report.issues.join(", ")} (${report.chars} chars)`);
  }
}
