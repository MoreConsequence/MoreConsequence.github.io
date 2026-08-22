#!/usr/bin/env node
// 证据链体检：对 evidence/<slug>/<date>/ 逐项检查"最小合同"三件套——
// 环境、命令、原始输出。它只回答"合同字段是否在场"，不判断结论对错。
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 默认锚定脚本自身位置：从任何工作目录运行结果一致（可复现性优先）。
const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "../../evidence");
const root = process.argv[2] ?? defaultRoot;
const RAW = /\.(log|txt|json|out)$/i;

function walkDateDirs() {
  const rows = [];
  for (const slug of readdirSync(root)) {
    const slugDir = join(root, slug);
    if (!statSync(slugDir).isDirectory()) continue;
    for (const date of readdirSync(slugDir)) {
      const dir = join(slugDir, date);
      if (!statSync(dir).isDirectory()) continue;
      rows.push({ slug, date, dir });
    }
  }
  return rows;
}

function auditOne({ slug, date, dir }) {
  const files = readdirSync(dir);
  const readme = files.find((f) => /^readme\.md$/i.test(f));
  let env = false,
    cmd = false,
    cmdBlocks = 0;
  if (readme) {
    const text = readFileSync(join(dir, readme), "utf8");
    // 环境记录：运行时名 + 版本号同时出现（Node x.y.z / go1.x.y / darwin 等）。
    // v1 版这里漏了 i 标志，"Node v24.19.0" 被误判为缺环境——审计工具自身也要报关。
    env = /node\s*v?\d+\.\d+|go1\.\d+|\d+\.\d+\.\d+/i.test(text);
    const blocks = text.match(/```(?:sh|bash|shell)\n[\s\S]*?```/g) ?? [];
    cmdBlocks = blocks.length;
    cmd = cmdBlocks > 0;
  }
  const rawFiles = files.filter(
    (f) => RAW.test(f) || (/\.md$/i.test(f) && !/^readme\.md$/i.test(f)),
  );
  const rawBytes = rawFiles.reduce(
    (sum, f) => sum + statSync(join(dir, f)).size,
    0,
  );
  // 可追溯性：slug 能对回实验目录或文章。规则：证据目录名必须等于工件名/文章 slug，
  // 任何修饰后缀（-first-run、-v2）都会破坏双向回溯——本工具自己就栽过两次。
  const expExists =
    existsSync(join(root, "..", "experiments", slug)) ||
    existsSync(join(root, "..", "content", "posts", `${slug}.md`));
  return {
    dir: `${basename(root)}/${slug}/${date}`,
    env,
    cmd,
    cmdBlocks,
    rawFiles: rawFiles.length,
    rawBytes,
    trace: expExists ? "ok" : "MISS",
    pass: env && cmd && rawFiles.length > 0 && expExists,
  };
}

const rows = walkDateDirs().map(auditOne);
console.log("| 证据目录 | 环境 | 命令 | 命令块数 | 原始文件 | 原始字节 | 可追溯 | 判定 |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  console.log(
    `| ${r.dir} | ${r.env ? "Y" : "-"} | ${r.cmd ? "Y" : "-"} | ${r.cmdBlocks} | ${r.rawFiles} | ${r.rawBytes} | ${r.trace} | ${r.pass ? "PASS" : "GAP"} |`,
  );
}
const n = rows.length;
const cnt = (fn) => rows.filter(fn).length;
console.log("");
console.log(`- 目录总数: ${n}`);
console.log(`- 完整合同(PASS): ${cnt((r) => r.pass)} (${((cnt((r) => r.pass) / n) * 100).toFixed(1)}%)`);
console.log(`- 缺环境记录: ${cnt((r) => !r.env)}`);
console.log(`- 缺命令块: ${cnt((r) => !r.cmd)}`);
console.log(`- 无原始输出文件: ${cnt((r) => r.rawFiles === 0)}`);
console.log(`- slug 无法回溯到 experiments/posts: ${cnt((r) => r.trace !== "ok")}`);
