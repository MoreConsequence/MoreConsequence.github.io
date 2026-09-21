// 内容复评分 v2（规则透明，替代 2026-09-14 快照口径漂移后的重打分）。
// 维度：prose=min(5,chars//800) fences=围栏数分档(0/1/2) evidence=有证据卡或evidence目录
//       refs=n_refs>=3 visual=含图片/图表引用
// 运行：node scripts/rescore-content.mjs [outdir]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "content", "posts");
const outDir = process.argv[2] ?? path.join(root, "evidence", "content-scores", "2026-09-20-local");

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

const rows = [];
for (const full of walk(postsDir).sort()) {
  const src = fs.readFileSync(full, "utf8");
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) continue;
  const meta = m[1], body = m[2];
  if (/^draft:\s*true/m.test(meta)) continue; // 只评已发布
  const slug = path.basename(full, ".md");
  const title = (meta.match(/^title:\s*"(.*)"\s*$/m) || [])[1] ?? "";
  const chars = body.replace(/\s/g, "").length;
  const fenceCount = (body.match(/```/g) || []).length / 2;
  const fences = fenceCount === 0 ? 0 : fenceCount <= 2 ? 1 : 2;
  const refSec = (body.split(/##\s*参考资料/)[1] || "").split(/^##\s+/m)[0];
  const nRefs = (refSec.match(/(https?:\/\/|\/writing\/)/g) || []).length;
  const refs = nRefs >= 3 ? 1 : 0;
  const evidence = /证据卡/.test(body) || fs.existsSync(path.join(root, "evidence", slug)) ? 1 : 0;
  const visual = /!\[[^\]]*\]\(/.test(body) ? 1 : 0;
  const prose = Math.min(5, Math.floor(chars / 800));
  const score = prose + fences + evidence + refs + visual;
  rows.push({ slug, score, prose, fences, evidence, refs, visual, chars, nFences: fenceCount, nRefs, title });
}

rows.sort((a, b) => a.score - b.score || a.slug.localeCompare(b.slug));
fs.mkdirSync(outDir, { recursive: true });
const head = "slug,score,prose,fences,evidence,refs,visual,chars,n_fences,n_refs,title";
fs.writeFileSync(
  path.join(outDir, "scores.csv"),
  [head, ...rows.map((r) => [r.slug, r.score, r.prose, r.fences, r.evidence, r.refs, r.visual, r.chars, r.nFences, r.nRefs, `"${r.title.replace(/"/g, "")}"`].join(","))].join("\n") + "\n",
);
console.log(`scored ${rows.length} posts -> ${outDir}/scores.csv`);
const dist = {};
for (const r of rows) dist[r.score] = (dist[r.score] ?? 0) + 1;
console.log("dist:", JSON.stringify(dist));
console.log("=== bottom 20 ===");
for (const r of rows.slice(0, 20))
  console.log(`${r.score} p${r.prose} f${r.fences} e${r.evidence} r${r.refs} v${r.visual} nrefs=${r.nRefs} chars=${r.chars} ${r.slug}`);
