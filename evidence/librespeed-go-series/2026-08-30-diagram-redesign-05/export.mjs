import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const evidenceDir = path.join(
  repoRoot,
  "evidence/librespeed-go-series/2026-08-30-diagram-redesign-05",
);

const exportsToRun = [
  {
    html: "librespeed-go-admin-session-security.html",
    svg: path.join(repoRoot, "public/images/librespeed-go-admin-session-security.svg"),
  },
  {
    html: "librespeed-go-rest-curl-sequence.html",
    svg: path.join(repoRoot, "public/images/librespeed-go-rest-curl-sequence.svg"),
  },
];

const svgFontImport =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;display=swap');</style>";

function extractFirstSvg(html) {
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/);
  if (!match) {
    throw new Error("No SVG block found in HTML source");
  }
  return match[0];
}

function makeStandaloneSvg(svg) {
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
    throw new Error("SVG source is missing the SVG namespace");
  }
  if (!svg.includes("viewBox=")) {
    throw new Error("SVG source is missing viewBox");
  }
  if (!svg.includes("<defs>")) {
    throw new Error("SVG source is missing a defs block for the font import");
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg.replace("<defs>", `<defs>${svgFontImport}`)}\n`;
}

for (const item of exportsToRun) {
  const source = await readFile(path.join(evidenceDir, item.html), "utf8");
  await writeFile(item.svg, makeStandaloneSvg(extractFirstSvg(source)), "utf8");
  console.log(`${item.html} -> ${path.relative(repoRoot, item.svg)}`);
}
