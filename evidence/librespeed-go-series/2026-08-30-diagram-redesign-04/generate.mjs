import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(evidenceDir, "../../..");

const fontStyle =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;family=Noto+Sans+KR:wght@400;500;600&amp;family=Noto+Serif+KR:wght@400&amp;display=swap');</style>";

const diagrams = [
  [
    "librespeed-go-contract-worker-lifecycle-script.html",
    "public/images/librespeed-go-contract-worker-lifecycle-script.svg",
  ],
  [
    "librespeed-go-telemetry-ulid-obfuscation.html",
    "public/images/librespeed-go-telemetry-ulid-obfuscation.svg",
  ],
  [
    "asymmetric-measurement-authority-flow.html",
    "public/images/asymmetric-measurement-authority-flow.svg",
  ],
];

for (const [sourceName, targetName] of diagrams) {
  const sourcePath = path.join(evidenceDir, sourceName);
  const targetPath = path.join(repoRoot, targetName);
  const html = fs.readFileSync(sourcePath, "utf8");
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!match) throw new Error(`No SVG found in ${sourceName}`);

  let svg = match[0];
  if (!/\bxmlns\s*=/.test(svg.slice(0, svg.indexOf(">") + 1))) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\bviewBox\s*=/.test(svg.slice(0, svg.indexOf(">") + 1))) {
    throw new Error(`SVG in ${sourceName} is missing viewBox`);
  }
  if (/<defs\b[^>]*>/i.test(svg)) {
    svg = svg.replace(/(<defs\b[^>]*>)/i, `$1${fontStyle}`);
  } else {
    svg = svg.replace(/(<svg\b[^>]*>)/i, `$1<defs>${fontStyle}</defs>`);
  }

  fs.writeFileSync(targetPath, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, "utf8");
  console.log(`${sourceName} -> ${targetName}`);
}
