import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function slugifyTitle(title) {
  return title
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function createPostDocument(title, date) {
  const safeTitle = JSON.stringify(title);
  return `---
title: ${safeTitle}
description: "请在这里填写一句话摘要"
publishedAt: "${date}"
tags: ["待整理"]
draft: true
featured: false
---

从这里开始写正文。
`;
}

export function formatLocalDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}

export async function writeNewPost({ root, title, date }) {
  const slug = slugifyTitle(title);
  if (!slug) throw new Error("文章标题无法生成有效文件名");

  const postsDirectory = path.join(root, "content", "posts");
  const outputPath = path.join(postsDirectory, `${slug}.md`);
  await mkdir(postsDirectory, { recursive: true });
  await writeFile(outputPath, createPostDocument(title, date), {
    encoding: "utf8",
    flag: "wx",
  });
  return outputPath;
}

async function main() {
  const title = process.argv.slice(2).join(" ").trim();
  if (!title) {
    console.error('用法：npm run new -- "文章标题"');
    process.exitCode = 1;
    return;
  }

  const date = formatLocalDate();
  try {
    const outputPath = await writeNewPost({
      root: process.cwd(),
      title,
      date,
    });
    console.log(`已创建：${path.relative(process.cwd(), outputPath)}`);
    console.log("填写摘要和标签，完成正文后将 draft 改为 false。");
  } catch (error) {
    if (error?.code === "EEXIST") {
      console.error("同名文章已经存在，未覆盖原文件。");
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
