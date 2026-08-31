import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const jobs = [
  [
    "librespeed-go-config-deploy-graceful-downgrade.html",
    "public/images/librespeed-go-config-deploy-graceful-downgrade.svg",
  ],
  [
    "viper-config-hierarchy-precedence.html",
    "public/images/viper-config-hierarchy-precedence.svg",
  ],
  [
    "librespeed-go-cloud-native-deploy-topology.html",
    "public/images/librespeed-go-cloud-native-deploy-topology.svg",
  ],
];

const fontImport =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;display=swap');</style>";

for (const [htmlName, outputName] of jobs) {
  const htmlPath = path.join(here, htmlName);
  const html = fs.readFileSync(htmlPath, "utf8");
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!match) {
    throw new Error(`No SVG found in ${htmlName}`);
  }

  let svg = match[0];
  if (!/\bxmlns=/.test(svg)) {
    svg = svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (/<defs\b[^>]*>/i.test(svg)) {
    svg = svg.replace(/(<defs\b[^>]*>)/i, `$1${fontImport}`);
  } else {
    svg = svg.replace(/<\/svg>/i, `<defs>${fontImport}</defs></svg>`);
  }

  const outputPath = path.join(repoRoot, outputName);
  fs.writeFileSync(outputPath, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
  console.log(`${htmlName} -> ${outputName}`);
}
