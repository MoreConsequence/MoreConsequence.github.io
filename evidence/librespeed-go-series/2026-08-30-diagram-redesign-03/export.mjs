import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const workDir = path.join(
  repoRoot,
  "evidence/librespeed-go-series/2026-08-30-diagram-redesign-03",
);

const exports = [
  [
    "librespeed-go-client-ip-proxy-cgnat-lookup.html",
    path.join(repoRoot, "public/images/librespeed-go-client-ip-proxy-cgnat-lookup.svg"),
  ],
  [
    "client-ip-five-level-proxy-chain.html",
    path.join(repoRoot, "public/images/client-ip-five-level-proxy-chain.svg"),
  ],
  [
    "special-ip-subnet-classification-matrix.html",
    path.join(repoRoot, "public/images/special-ip-subnet-classification-matrix.svg"),
  ],
];

const svgFontImport =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;family=Noto+Sans+SC:wght@400;500;600&amp;family=Noto+Serif+SC:wght@400&amp;display=swap');</style>";

function extractSvg(html, source) {
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!match) {
    throw new Error(`No SVG block found in ${source}`);
  }

  let svg = match[0];
  if (!/\bxmlns\s*=/.test(svg)) {
    svg = svg.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\bviewBox\s*=/.test(svg)) {
    throw new Error(`Missing viewBox in ${source}`);
  }
  if (!/<defs\b[^>]*>/i.test(svg)) {
    svg = svg.replace(/(<svg\b[^>]*>)/i, `$1<defs>${svgFontImport}</defs>`);
  } else {
    svg = svg.replace(/(<defs\b[^>]*>)/i, `$1${svgFontImport}`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`;
}

for (const [sourceName, outputPath] of exports) {
  const sourcePath = path.join(workDir, sourceName);
  const html = await readFile(sourcePath, "utf8");
  const svg = extractSvg(html, sourceName);
  await writeFile(outputPath, svg, "utf8");
  console.log(`${sourceName} -> ${path.relative(repoRoot, outputPath)}`);
}
