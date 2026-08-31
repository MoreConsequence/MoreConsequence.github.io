#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const exportsBySource = [
  [
    "librespeed-go-speedtest-full-lifecycle-timeline.html",
    "/Users/lianghaoyu/codes/github-blog/public/images/librespeed-go-speedtest-full-lifecycle-timeline.svg",
  ],
  [
    "librespeed-go-p90-trimmed-mean-filter.html",
    "/Users/lianghaoyu/codes/github-blog/public/images/librespeed-go-p90-trimmed-mean-filter.svg",
  ],
  [
    "librespeed-go-latency-jitter-filter-math.html",
    "/Users/lianghaoyu/codes/github-blog/public/images/librespeed-go-latency-jitter-filter-math.svg",
  ],
];

const fontStyle =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;display=swap');</style>";

for (const [sourceName, outputPath] of exportsBySource) {
  const sourcePath = path.join(root, sourceName);
  const html = fs.readFileSync(sourcePath, "utf8");
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!match) throw new Error("No SVG found in " + sourcePath);

  let svg = match[0];
  const openingTagEnd = svg.indexOf(">");
  if (!/\bxmlns\s*=/.test(svg.slice(0, openingTagEnd + 1))) {
    svg = svg.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (svg.includes("<defs>")) {
    svg = svg.replace("<defs>", "<defs>" + fontStyle);
  } else {
    svg = svg.replace(/(<svg\b[^>]*>)/, "$1<defs>" + fontStyle + "</defs>");
  }

  fs.writeFileSync(outputPath, '<?xml version="1.0" encoding="UTF-8"?>\n' + svg + "\n", "utf8");
  console.log(sourceName + " -> " + outputPath);
}
