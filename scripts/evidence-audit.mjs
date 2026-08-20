import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "content", "posts");
const evidenceDir = path.join(root, "evidence");

const files = fs.readdirSync(postsDir).filter((file) => file.endsWith(".md")).sort();

const round3 = (n) => Math.round(n * 1000) / 1000;
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

const evidenceRef = /\b(?:evidence|experiments)\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*\b/g;
const unitNum = /\b\d+\.\d+\s*(?:ns|µs|ms|%|GiB|GB|MB|KB|req\/s|op|ms\/op|ns\/op)\b/gi;

function splitRef(raw) {
  const segs = raw.split("/");
  if (segs[0] === "evidence") return { kind: "evidence", name: segs[1], list: [raw] };
  const dir = segs[1];
  const rest = segs.slice(2);
  const inner = rest.indexOf("evidence");
  if (inner >= 0) {
    const innerName = rest[inner + 1];
    return {
      kind: "experiments",
      name: dir,
      list: [`experiments/${dir}/evidence/${innerName}`],
    };
  }
  return { kind: "experiments", name: dir, list: [raw] };
}

function hasRawFiles(evDirName) {
  const dir = path.join(evidenceDir, evDirName);
  if (!fs.existsSync(dir)) return { exists: false };
  const versions = fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d));
  if (!versions.length) return { exists: true, noVersions: true };
  const raw = [];
  for (const v of versions) {
    const walk = (p) => {
      for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(txt|out|log|csv|tsv|json|md|go|py|mjs|ts|mts)$/.test(entry.name)) raw.push(full);
      }
    };
    walk(path.join(dir, v));
  }
  return { exists: true, noVersions: false, rawCount: raw.length, raw };
}

const reports = [];
for (const file of files) {
  const slug = file.slice(0, -3);
  const source = fs.readFileSync(path.join(postsDir, file), "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) continue;
  const body = match[2];
  const draft = /^draft:\s*true/m.test(match[1]);

  const refs = [];
  for (const item of body.matchAll(evidenceRef)) {
    refs.push(splitRef(item[0]));
  }

  const problems = [];
  for (const ref of refs) {
    for (const target of ref.list) {
      const p = path.join(root, target);
      if (!fs.existsSync(p)) {
        problems.push(`missing ${target}`);
        continue;
      }
      if (/\/evidence\//.test(target)) continue;
      if (target.startsWith("evidence/")) {
        const cover = hasRawFiles(ref.name);
        if (!cover.exists) problems.push(`evidence dir lacks dated version: ${ref.name}`);
        else if (cover.noVersions) problems.push(`evidence/${ref.name} has no dated snapshot dir`);
        else if (!cover.rawCount) problems.push(`evidence/${ref.name} has dated dir but no raw files`);
      }
      if (target.startsWith("experiments/") && fs.statSync(p).isDirectory() && target === `experiments/${ref.name}`) {
        const runnableExt = /\.(go|py|mjs|js|ts|sh|sql)$/;
        const has = (dir) =>
          fs.readdirSync(dir).some((f) => runnableExt.test(f));
        const entries = fs.readdirSync(p);
        const runnable =
          ["package.json", "go.mod", "Makefile", "README.md"].some((f) => entries.includes(f))
          || has(p)
          || entries
              .filter((e) => fs.statSync(path.join(p, e)).isDirectory())
              .some((d) => has(path.join(p, d)));
        if (!runnable) problems.push(`experiments/${ref.name} has no runnable entry files`);
      }
    }
  }

  let drift = [];
  if (!problems.length) {
    for (const ref of refs.filter((r) => r.kind === "evidence")) {
      const cover = hasRawFiles(ref.name);
      if (!cover.raw) continue;
      const rawText = cover.raw.map((p) => fs.readFileSync(p, "utf8")).join("\n");
      const rawNums = new Set(
        (rawText.match(/\d+(?:\.\d+)?/g) ?? [])
          .flatMap((n) => {
            const v = parseFloat(n);
            return [v, v * 1000, v / 1000];
          })
          .map((x) => round3(x)),
      );
      const articleNums = [...body.matchAll(unitNum)]
        .map((m) => parseFloat(m[0]));
      for (const v of articleNums) {
        const near = [round3(v), round(v, 2), round(v, 1), round3(v * 1000), round3(v / 1000)]
          .some((x) => rawNums.has(x));
        if (!near) drift.push(`${ref.name}: article value "${v}" not found in raw`);
      }
    }
    drift = [...new Set(drift)];
  }

  reports.push({
    slug,
    draft,
    chars: body.length,
    evidenceRefs: refs.length,
    problems: problems.length ? [...new Set(problems)] : [],
    drift: drift.slice(0, 8),
    dirty: problems.length > 0 || drift.length > 0,
  });
}

const published = reports.filter((r) => !r.draft);
const hardFails = published.filter((r) => r.problems.length);
const driftSoft = published.filter((r) => !r.problems.length && r.drift.length);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ published: published.length, hardFails, driftSoft }, null, 2));
} else {
  console.log(`# Evidence audit\n\n- Published posts: ${published.length}\n- Hard fails (missing paths/dirs): ${hardFails.length}\n- Soft drift candidates (unit numbers absent from raw): ${driftSoft.length}\n`);
  for (const r of hardFails) console.log(`- HARD ${r.slug}: ${r.problems.join(", ")}`);
  for (const r of driftSoft) console.log(`- DRIFT ${r.slug}:\n    ${r.drift.join("\n    ")}`);
}

process.exit(hardFails.length ? 1 : 0);