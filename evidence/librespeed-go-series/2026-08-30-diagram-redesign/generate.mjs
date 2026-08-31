import { mkdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";

const repoRoot = process.cwd();
const workDir = nodePath.join(
  repoRoot,
  "evidence/librespeed-go-series/2026-08-30-diagram-redesign",
);
const publicImagesDir = nodePath.join(repoRoot, "public/images");

const colors = {
  paper: "#f5f4ed",
  paper2: "#e8e6dc",
  ink: "#141413",
  muted: "#6b6a64",
  soft: "#857a69",
  rule: "rgba(20,20,19,0.16)",
  accent: "#e85d3f",
  accentTint: "rgba(232,93,63,0.10)",
  link: "#2d5a8a",
  linkTint: "rgba(45,90,138,0.07)",
  white: "#fffdfb",
};

const fonts = {
  sans: "'Geist', 'Noto Sans SC', 'PingFang SC', sans-serif",
  mono: "'Geist Mono', 'Noto Sans Mono SC', 'SFMono-Regular', monospace",
  serif: "'Instrument Serif', 'Noto Serif SC', 'Songti SC', serif",
};

const requiredFontLink =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap";
const cjkFontLink =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600&family=Noto+Serif+SC:wght@400&display=swap";
const svgFontImport =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;family=Noto+Sans+SC:wght@400;500;600&amp;family=Noto+Serif+SC:wght@400&amp;display=swap');</style>";

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function text(x, y, value, options = {}) {
  const {
    fill = colors.ink,
    size = 12,
    family = fonts.sans,
    weight = 400,
    anchor = "start",
    letterSpacing = 0,
    italic = false,
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="${family}" font-weight="${weight}" text-anchor="${anchor}"${letterSpacing ? ` letter-spacing="${letterSpacing}em"` : ""}${italic ? ' font-style="italic"' : ""}>${esc(value)}</text>`;
}

function rect(x, y, width, height, options = {}) {
  const {
    fill = "none",
    stroke = "none",
    strokeWidth = 1,
    rx = 0,
    opacity,
    dash,
  } = options;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${opacity === undefined ? "" : ` opacity="${opacity}"`}${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function line(x1, y1, x2, y2, options = {}) {
  const {
    stroke = colors.muted,
    strokeWidth = 1.2,
    marker,
    dash,
  } = options;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${marker ? ` marker-end="url(#${marker})"` : ""}/>`;
}

function path(d, options = {}) {
  const {
    stroke = colors.muted,
    strokeWidth = 1.2,
    marker,
    dash,
  } = options;
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${marker ? ` marker-end="url(#${marker})"` : ""}/>`;
}

function label(maskX, maskY, width, value, options = {}) {
  const { textFill = colors.soft } = options;
  return [
    rect(maskX, maskY, width, 12, { fill: colors.paper, rx: 2 }),
    text(maskX + width / 2, maskY + 12, value, {
      fill: textFill,
      size: 8,
      family: fonts.mono,
      anchor: "middle",
      letterSpacing: 0.06,
    }),
  ].join("");
}

function node({
  x,
  y,
  width,
  height,
  tag,
  title,
  sub,
  fill = colors.white,
  stroke = colors.ink,
  focal = false,
  titleSize = 16,
}) {
  const nodeFill = focal ? colors.accentTint : fill;
  const nodeStroke = focal ? colors.accent : stroke;
  const titleY = height <= 64 ? y + 36 : height >= 80 ? y + 48 : y + 44;
  const subY = height <= 64 ? y + 52 : titleY + 20;
  const tagWidth = Math.max(36, Math.ceil((tag.length * 7 + 12) / 4) * 4);
  return [
    rect(x, y, width, height, { fill: colors.paper, rx: 6 }),
    rect(x, y, width, height, {
      fill: nodeFill,
      stroke: nodeStroke,
      strokeWidth: focal ? 1.2 : 1,
      rx: 6,
    }),
    rect(x + 12, y + 12, tagWidth, 16, {
      fill: "none",
      stroke: nodeStroke,
      strokeWidth: 0.8,
      rx: 2,
    }),
    text(x + 12 + tagWidth / 2, y + 24, tag, {
      fill: nodeStroke,
      size: 8,
      family: fonts.mono,
      weight: 500,
      anchor: "middle",
      letterSpacing: 0.08,
    }),
    text(x + width / 2, titleY, title, {
      fill: colors.ink,
      size: titleSize,
      family: fonts.sans,
      weight: 600,
      anchor: "middle",
    }),
    text(x + width / 2, subY, sub, {
      fill: colors.muted,
      size: 8,
      family: fonts.mono,
      anchor: "middle",
    }),
  ].join("");
}

function markers(prefix) {
  return [
    `<marker id="${prefix}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${colors.muted}"/></marker>`,
    `<marker id="${prefix}-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${colors.accent}"/></marker>`,
    `<marker id="${prefix}-arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${colors.link}"/></marker>`,
  ].join("");
}

function svgFrame({ id, title, description, eyebrow, subtitle, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="100%" height="100%" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${esc(title)}</title>
<desc id="${id}-desc">${esc(description)}</desc>
<defs>${markers(id)}</defs>
<rect width="960" height="600" fill="${colors.paper}"/>
${text(40, 52, eyebrow, { fill: colors.muted, size: 8, family: fonts.mono, weight: 500, letterSpacing: 0.18 })}
${text(40, 92, title, { fill: colors.ink, size: 28, family: fonts.serif })}
${text(40, 120, subtitle, { fill: colors.muted, size: 12, family: fonts.sans })}
${body}
</svg>`;
}

function htmlPage(title, svg) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <link href="${requiredFontLink}" rel="stylesheet">
  <link href="${cjkFontLink}" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root { --paper: ${colors.paper}; --ink: ${colors.ink}; }
    body { margin: 0; min-height: 100vh; padding: 40px; background: var(--paper); color: var(--ink); }
    main { width: min(960px, 100%); margin: 0 auto; }
    svg { display: block; width: 100%; height: auto; }
  </style>
</head>
<body>
  <main>${svg}</main>
</body>
</html>
`;
}

function addSvgFontImport(svg) {
  return svg.replace("<defs>", `<defs>${svgFontImport}`);
}

function extractSvg(html) {
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/);
  if (!match) throw new Error("No SVG found in generated HTML");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${addSvgFontImport(match[0])}\n`;
}

function legend(items) {
  const swatches = items
    .map((item) => {
      const swatch = rect(item.x, 548, 12, 12, {
        fill: item.fill,
        stroke: item.stroke ?? item.fill,
        strokeWidth: 0.8,
        rx: 2,
      });
      return `${swatch}${text(item.x + 20, 560, item.label, { fill: colors.muted, size: 8, family: fonts.mono })}`;
    })
    .join("");
  return `${line(40, 532, 920, 532, { stroke: colors.rule, strokeWidth: 0.8 })}${text(40, 560, "LEGEND", { fill: colors.muted, size: 8, family: fonts.mono, weight: 500, letterSpacing: 0.14 })}${swatches}`;
}

function overviewSvg() {
  const id = "librespeed-go-overview";
  const body = [
    rect(224, 144, 692, 376, { fill: "rgba(20,20,19,0.02)", stroke: colors.rule, strokeWidth: 0.8, rx: 8 }),
    rect(244, 148, 124, 16, { fill: colors.paper, rx: 2 }),
    text(248, 160, "SINGLE BINARY", { fill: colors.soft, size: 8, family: fonts.mono, weight: 500, letterSpacing: 0.14 }),

    line(416, 216, 480, 216, { stroke: colors.muted, marker: `${id}-arrow` }),
    label(432, 196, 32, "LOAD"),
    path("M556,252 H572 Q580,252 580,260 V328", { stroke: colors.muted, marker: `${id}-arrow` }),
    label(588, 280, 48, "SERVE"),
    line(200, 368, 480, 368, { stroke: colors.link, marker: `${id}-arrow-link` }),
    label(320, 348, 40, "HTTP", { textFill: colors.link }),
    line(680, 368, 736, 368, { stroke: colors.muted, marker: `${id}-arrow` }),
    label(692, 348, 32, "POST"),
    line(808, 408, 808, 448, { stroke: colors.muted, marker: `${id}-arrow` }),
    label(816, 416, 24, "DB"),

    node({ x: 56, y: 332, width: 144, height: 72, tag: "INPUT", title: "浏览器 / APP", sub: "HTTP client", fill: "rgba(107,106,100,0.08)", stroke: colors.soft, titleSize: 12 }),
    node({ x: 264, y: 180, width: 152, height: 72, tag: "BOOT", title: "main.go", sub: "flag.Parse · init order", titleSize: 16 }),
    node({ x: 480, y: 180, width: 152, height: 72, tag: "CONFIG", title: "config", sub: "settings.toml · defaults", titleSize: 16 }),
    node({ x: 480, y: 328, width: 200, height: 80, tag: "HTTP", title: "HTTP 测速端点", sub: "chi · /empty /garbage /getIP", fill: colors.accentTint, stroke: colors.accent, focal: true, titleSize: 16 }),
    node({ x: 736, y: 328, width: 144, height: 80, tag: "RESULT", title: "结果处理", sub: "Record · DrawPNG · JSON", titleSize: 12 }),
    node({ x: 736, y: 448, width: 144, height: 64, tag: "STORE", title: "database.DB", sub: "DataAccess · 7 backends", fill: "rgba(20,20,19,0.05)", stroke: colors.muted, titleSize: 12 }),

    legend([
      { x: 136, label: "HTTP / API", fill: colors.link },
      { x: 304, label: "STARTUP", fill: colors.muted },
      { x: 452, label: "FOCUS", fill: colors.accent },
    ]),
  ].join("");
  return svgFrame({
    id,
    title: "LibreSpeed Go：一个单二进制的四层职责",
    description: "架构图展示浏览器请求如何进入单二进制，并经过 main.go、config、web、results 与 database 的职责边界。",
    eyebrow: "ARCHITECTURE · 59CFF12",
    subtitle: "main.go 连接配置、HTTP 测速、结果处理与可选存储",
    body,
  });
}

function layerRow({ y, number, title, sub, focal = false, fill = colors.paper }) {
  const stroke = focal ? colors.accent : colors.rule;
  const rowFill = focal ? colors.accentTint : fill;
  return [
    rect(80, y, 800, 64, { fill: rowFill, stroke, strokeWidth: focal ? 1.2 : 0.8, rx: 0 }),
    rect(104, y + 20, 40, 20, { fill: "none", stroke: focal ? colors.accent : colors.soft, strokeWidth: 0.8, rx: 2 }),
    text(124, y + 34, number, { fill: focal ? colors.accent : colors.soft, size: 8, family: fonts.mono, weight: 500, anchor: "middle", letterSpacing: 0.08 }),
    text(176, y + 38, title, { fill: focal ? colors.accent : colors.ink, size: 16, family: fonts.sans, weight: 600 }),
    text(496, y + 36, sub, { fill: colors.muted, size: 8, family: fonts.mono }),
  ].join("");
}

function layerSvg() {
  const id = "librespeed-go-layered-architecture";
  const body = [
    line(48, 180, 48, 480, { stroke: colors.soft, strokeWidth: 1, marker: `${id}-arrow` }),
    text(48, 504, "启动 → 存储", { fill: colors.soft, size: 12, family: fonts.sans, weight: 500, anchor: "middle" }),
    rect(80, 160, 800, 320, { fill: "none", stroke: colors.ink, strokeWidth: 1, rx: 6 }),
    layerRow({ y: 160, number: "01", title: "main.go", sub: "flag.Parse · Load · ListenAndServe", fill: colors.white }),
    layerRow({ y: 224, number: "02", title: "config", sub: "settings.toml · defaults · server location", fill: colors.paper2 }),
    layerRow({ y: 288, number: "03", title: "web", sub: "chi routes · empty · garbage · getIP", focal: true }),
    layerRow({ y: 352, number: "04", title: "results", sub: "telemetry · DrawPNG · JSON", fill: colors.paper2 }),
    layerRow({ y: 416, number: "05", title: "database", sub: "DataAccess · 7 selectable backends", fill: colors.white }),
    legend([
      { x: 136, label: "RESPONSIBILITY LAYER", fill: colors.muted },
      { x: 356, label: "REQUEST SURFACE", fill: colors.accent },
    ]),
  ].join("");
  return svgFrame({
    id,
    title: "从 main.go 到可替换存储：五层职责",
    description: "分层图按启动到存储的方向展示 main.go、config、web、results 与 database 的源码职责。",
    eyebrow: "LAYER STACK · SOURCE MAP",
    subtitle: "每一层只回答一个问题，web 是请求路径的主入口",
    body,
  });
}

function routeSvg() {
  const id = "librespeed-go-route-convergence";
  const body = [
    text(64, 156, "ROUTE FAMILIES", { fill: colors.soft, size: 8, family: fonts.mono, weight: 500, letterSpacing: 0.14 }),
    text(424, 156, "SHARED IMPLEMENTATION", { fill: colors.soft, size: 8, family: fonts.mono, weight: 500, letterSpacing: 0.14 }),
    text(728, 156, "API CONTRACT", { fill: colors.soft, size: 8, family: fonts.mono, weight: 500, letterSpacing: 0.14 }),

    path("M328,204 H376 Q384,204 384,212 V300 H424", { stroke: colors.link, marker: `${id}-arrow-link` }),
    path("M328,308 H360 Q368,308 368,316 V324 H424", { stroke: colors.link, marker: `${id}-arrow-link` }),
    path("M328,412 H376 Q384,412 384,404 V348 H424", { stroke: colors.link, marker: `${id}-arrow-link` }),
    line(644, 324, 728, 324, { stroke: colors.accent, marker: `${id}-arrow-accent`, strokeWidth: 1.2 }),
    label(668, 304, 40, "SAME", { textFill: colors.accent }),

    node({ x: 64, y: 168, width: 264, height: 72, tag: "ROUTE", title: "原生路径", sub: "/empty · /garbage · /getIP", fill: colors.linkTint, stroke: colors.link, titleSize: 16 }),
    node({ x: 64, y: 272, width: 264, height: 72, tag: "ROUTE", title: "前缀路径", sub: "/backend/empty · /backend/...", fill: colors.linkTint, stroke: colors.link, titleSize: 16 }),
    node({ x: 64, y: 376, width: 264, height: 72, tag: "ROUTE", title: "PHP 兼容路径", sub: "/empty.php · /garbage.php", fill: colors.linkTint, stroke: colors.link, titleSize: 16 }),
    node({ x: 424, y: 276, width: 220, height: 96, tag: "HANDLER", title: "同一份 Go Handler", sub: "empty · garbage · getIP", focal: true, titleSize: 16 }),
    node({ x: 728, y: 276, width: 168, height: 96, tag: "CONTRACT", title: "兼容路径仍可用", sub: "same handler · no redirect", fill: colors.white, stroke: colors.ink, titleSize: 12 }),

    text(64, 496, "PHP 兼容路径直接挂到 Handler，不经过重定向。", { fill: colors.muted, size: 12, family: fonts.sans }),
    legend([
      { x: 136, label: "PUBLIC ROUTE", fill: colors.link },
      { x: 356, label: "SHARED HANDLER", fill: colors.accent },
    ]),
  ].join("");
  return svgFrame({
    id,
    title: "路由合同：三种 URL 形态，共用同一 Handler",
    description: "路由关系图展示原生、backend 前缀和 PHP 兼容路径如何直接挂载到同一份 Go Handler。",
    eyebrow: "ROUTE MAP · COMPATIBILITY",
    subtitle: "URL 是 API 合同：兼容路径是直接挂载，不是重定向",
    body,
  });
}

const diagrams = [
  {
    name: "librespeed-go-architecture-overview-pipeline",
    title: "LibreSpeed Go：一个单二进制的四层职责",
    svg: overviewSvg(),
  },
  {
    name: "librespeed-go-package-dependency-graph",
    title: "从 main.go 到可替换存储：五层职责",
    svg: layerSvg(),
  },
  {
    name: "librespeed-go-multi-mount-routing-table",
    title: "路由合同：三种 URL 形态，共用同一 Handler",
    svg: routeSvg(),
  },
];

await mkdir(workDir, { recursive: true });
for (const diagram of diagrams) {
  const htmlPath = nodePath.join(workDir, `${diagram.name}.html`);
  const svgPath = nodePath.join(publicImagesDir, `${diagram.name}.svg`);
  const html = htmlPage(diagram.title, diagram.svg);
  await writeFile(htmlPath, html, "utf8");
  const sourceHtml = await readFile(htmlPath, "utf8");
  await writeFile(svgPath, extractSvg(sourceHtml), "utf8");
  console.log(`${diagram.name}: ${htmlPath} -> ${svgPath}`);
}
