import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const fontStyle =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;family=Noto+Sans+KR:wght@400;500;600&amp;family=Noto+Serif+KR:wght@400&amp;display=swap');</style>";

const exports = [
  {
    source: "librespeed-go-endpoints-garbage-empty-backend.html",
    target: path.join(repo, "public/images/librespeed-go-endpoints-garbage-empty-backend.svg"),
  },
  {
    source: "garbage-chunk-writer-zero-alloc-pipeline.html",
    target: path.join(repo, "public/images/garbage-chunk-writer-zero-alloc-pipeline.svg"),
  },
  {
    source: "empty-endpoint-dual-purpose-sink.html",
    target: path.join(repo, "public/images/empty-endpoint-dual-purpose-sink.svg"),
  },
];

for (const item of exports) {
  const html = fs.readFileSync(path.join(here, item.source), "utf8");
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!match) {
    throw new Error("No SVG found in " + item.source);
  }

  let svg = match[0];
  if (!/\sxmlns=/.test(svg.slice(0, svg.indexOf(">") + 1))) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\sviewBox=/.test(svg.slice(0, svg.indexOf(">") + 1))) {
    throw new Error("Missing viewBox in " + item.source);
  }
  if (svg.includes("<defs>")) {
    svg = svg.replace("<defs>", "<defs>" + fontStyle);
  } else {
    svg = svg.replace(/(<svg\b[^>]*>)/i, "$1" + fontStyle);
  }

  fs.writeFileSync(item.target, '<?xml version="1.0" encoding="UTF-8"?>\n' + svg + "\n");
  console.log(path.relative(repo, item.target));
}
