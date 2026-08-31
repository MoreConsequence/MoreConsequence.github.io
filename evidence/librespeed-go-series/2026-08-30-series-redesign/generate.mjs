import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const evidenceRoot = path.join(
  repoRoot,
  "evidence/librespeed-go-series/2026-08-30-series-redesign",
);
const imageRoot = path.join(repoRoot, "public/images");

const C = {
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

const F = {
  sans: "'Geist', 'Noto Sans SC', 'PingFang SC', sans-serif",
  mono: "'Geist Mono', 'Noto Sans Mono SC', 'SFMono-Regular', monospace",
  serif: "'Instrument Serif', 'Noto Serif SC', 'Songti SC', serif",
};

const fontLink =
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

function txt(x, y, value, options = {}) {
  const {
    fill = C.ink,
    size = 12,
    family = F.sans,
    weight = 400,
    anchor = "start",
    spacing = 0,
    italic = false,
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="${family}" font-weight="${weight}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}em"` : ""}${italic ? ' font-style="italic"' : ""}>${esc(value)}</text>`;
}

function box(x, y, width, height, options = {}) {
  const {
    fill = "none",
    stroke = "none",
    strokeWidth = 1,
    rx = 0,
    dash,
  } = options;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function line(x1, y1, x2, y2, options = {}) {
  const { stroke = C.muted, strokeWidth = 1.2, marker, dash } = options;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${marker ? ` marker-end="url(#${marker})"` : ""}/>`;
}

function curve(d, options = {}) {
  const { stroke = C.muted, strokeWidth = 1.2, marker, dash } = options;
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${marker ? ` marker-end="url(#${marker})"` : ""}/>`;
}

function arrowDefs(id) {
  return [
    `<marker id="${id}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${C.muted}"/></marker>`,
    `<marker id="${id}-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${C.accent}"/></marker>`,
    `<marker id="${id}-arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${C.link}"/></marker>`,
  ].join("");
}

function arrowLabel(x, y, width, value, color = C.soft) {
  return `${box(x, y, width, 12, { fill: C.paper, rx: 2 })}${txt(x + width / 2, y + 12, value, { fill: color, size: 8, family: F.mono, anchor: "middle", spacing: 0.06 })}`;
}

function node({
  x,
  y,
  width,
  height,
  tag,
  title,
  sub,
  fill = C.white,
  stroke = C.ink,
  focal = false,
  titleSize = 16,
}) {
  const actualFill = focal ? C.accentTint : fill;
  const actualStroke = focal ? C.accent : stroke;
  const titleY = height <= 64 ? y + 36 : height >= 80 ? y + 48 : y + 44;
  const subY = height <= 64 ? y + 52 : titleY + 20;
  const tagWidth = Math.max(36, Math.ceil((tag.length * 7 + 12) / 4) * 4);
  return [
    box(x, y, width, height, { fill: C.paper, rx: 6 }),
    box(x, y, width, height, { fill: actualFill, stroke: actualStroke, strokeWidth: focal ? 1.2 : 1, rx: 6 }),
    box(x + 12, y + 12, tagWidth, 16, { fill: "none", stroke: actualStroke, strokeWidth: 0.8, rx: 2 }),
    txt(x + 12 + tagWidth / 2, y + 24, tag, { fill: actualStroke, size: 8, family: F.mono, weight: 500, anchor: "middle", spacing: 0.08 }),
    txt(x + width / 2, titleY, title, { fill: focal ? C.ink : C.ink, size: titleSize, family: F.sans, weight: 600, anchor: "middle" }),
    txt(x + width / 2, subY, sub, { fill: C.muted, size: 8, family: F.mono, anchor: "middle" }),
  ].join("");
}

function legend(items) {
  const swatches = items.map((item) => `${box(item.x, 548, 12, 12, { fill: item.fill, stroke: item.stroke ?? item.fill, strokeWidth: 0.8, rx: 2 })}${txt(item.x + 20, 560, item.label, { fill: C.muted, size: 8, family: F.mono })}`).join("");
  return `${line(40, 532, 920, 532, { stroke: C.rule, strokeWidth: 0.8 })}${txt(40, 560, "LEGEND", { fill: C.muted, size: 8, family: F.mono, weight: 500, spacing: 0.14 })}${swatches}`;
}

function frame({ id, title, description, eyebrow, subtitle, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="100%" height="100%" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${esc(title)}</title>
<desc id="${id}-desc">${esc(description)}</desc>
<defs>${arrowDefs(id)}</defs>
<rect width="960" height="600" fill="${C.paper}"/>
${txt(40, 52, eyebrow, { fill: C.muted, size: 8, family: F.mono, weight: 500, spacing: 0.18 })}
${txt(40, 92, title, { fill: C.ink, size: 28, family: F.serif })}
${txt(40, 120, subtitle, { fill: C.muted, size: 12, family: F.sans })}
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
  <link href="${fontLink}" rel="stylesheet">
  <link href="${cjkFontLink}" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; padding: 40px; background: ${C.paper}; color: ${C.ink}; }
    main { width: min(960px, 100%); margin: 0 auto; }
    svg { display: block; width: 100%; height: auto; }
  </style>
</head>
<body><main>${svg}</main></body>
</html>
`;
}

function exportSvg(html) {
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/);
  if (!match) throw new Error("generated HTML does not contain an SVG");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${match[0].replace("<defs>", `<defs>${svgFontImport}`)}\n`;
}

function tableBody({ id, title, description, eyebrow, subtitle, columns, rows, rowHeight = 48, tableY = 160, focusIndex = -1 }) {
  const x0 = 64;
  const totalWidth = 832;
  const headerHeight = rowHeight;
  let out = box(x0, tableY, totalWidth, headerHeight, { fill: C.paper2, stroke: C.ink, strokeWidth: 1, rx: 6 });
  let cursor = x0;
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i];
    if (i > 0) out += line(cursor, tableY, cursor, tableY + headerHeight + rows.length * rowHeight, { stroke: C.rule, strokeWidth: 0.8 });
    out += txt(cursor + 12, tableY + 30, col.label, { fill: C.ink, size: 12, family: F.sans, weight: 600 });
    cursor += col.width;
  }
  out += line(x0, tableY + headerHeight, x0 + totalWidth, tableY + headerHeight, { stroke: C.rule, strokeWidth: 0.8 });
  rows.forEach((row, rowIndex) => {
    const y = tableY + headerHeight + rowIndex * rowHeight;
    out += box(x0, y, totalWidth, rowHeight, { fill: rowIndex === focusIndex ? C.accentTint : rowIndex % 2 ? C.white : "rgba(20,20,19,0.02)", stroke: rowIndex === focusIndex ? C.accent : C.rule, strokeWidth: rowIndex === focusIndex ? 1.2 : 0.8, rx: rowIndex === rows.length - 1 ? 6 : 0 });
    let x = x0;
    row.forEach((cell, cellIndex) => {
      const value = typeof cell === "string" ? { title: cell } : cell;
      const col = columns[cellIndex];
      out += txt(x + 12, y + (rowHeight >= 48 ? 30 : 26), value.title, { fill: value.color ?? (rowIndex === focusIndex && cellIndex === 0 ? C.accent : C.ink), size: value.size ?? 12, family: value.mono ? F.mono : F.sans, weight: value.weight ?? (cellIndex === 0 ? 600 : 400) });
      if (value.sub) out += txt(x + 12, y + (rowHeight >= 48 ? 44 : 38), value.sub, { fill: C.muted, size: 8, family: F.mono });
      x += col.width;
    });
  });
  const legendItems = [{ x: 136, label: "SOURCE-BACKED", fill: C.muted }];
  if (focusIndex >= 0) legendItems.push({ x: 356, label: "FOCUS", fill: C.accent });
  out += legend(legendItems);
  return frame({ id, title, description, eyebrow, subtitle, body: out });
}

function endpointOverview() {
  const id = "librespeed-go-endpoints-overview";
  const ys = [152, 276, 400];
  const body = [
    txt(56, 144, "MEASUREMENT SURFACE", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(624, 144, "SERVER RESPONSIBILITY", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    node({ x: 56, y: 276, width: 144, height: 88, tag: "INPUT", title: "客户端", sub: "request + count", fill: "rgba(107,106,100,0.08)", stroke: C.soft, titleSize: 16 }),
    node({ x: 320, y: ys[0], width: 208, height: 72, tag: "DOWN", title: "下行载荷", sub: "GET · randomData · ckSize", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 320, y: ys[1], width: 208, height: 72, tag: "UP", title: "上行接收", sub: "POST · io.Copy(Discard)", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 320, y: ys[2], width: 208, height: 72, tag: "IDENTITY", title: "身份查询", sub: "GET · header chain", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 624, y: ys[0], width: 240, height: 72, tag: "OUTPUT", title: "客户端收到字节", sub: "measurement: downlink", titleSize: 12 }),
    node({ x: 624, y: ys[1], width: 240, height: 72, tag: "SINK", title: "Discard 汇", sub: "no persistent body", fill: "rgba(20,20,19,0.05)", stroke: C.muted, titleSize: 12 }),
    node({ x: 624, y: ys[2], width: 240, height: 72, tag: "RESULT", title: "IP / ISP / distance", sub: "display-oriented metadata", titleSize: 12 }),

    curve("M200,296 H260 Q268,296 268,288 V188 H320", { stroke: C.link, marker: `${id}-arrow-link` }),
    curve("M200,320 H276 Q284,320 284,312 V312 H320", { stroke: C.link, marker: `${id}-arrow-link` }),
    curve("M200,344 H292 Q300,344 300,352 V436 H320", { stroke: C.link, marker: `${id}-arrow-link` }),
    line(528, 188, 624, 188, { stroke: C.muted, marker: `${id}-arrow` }),
    line(528, 312, 624, 312, { stroke: C.muted, marker: `${id}-arrow` }),
    line(528, 436, 624, 436, { stroke: C.muted, marker: `${id}-arrow` }),
    arrowLabel(232, 272, 40, "REQUEST", C.link),
    arrowLabel(552, 168, 40, "BYTES"),
    arrowLabel(552, 292, 40, "BODY"),
    arrowLabel(552, 416, 40, "JSON"),
    legend([
      { x: 136, label: "HTTP / API", fill: C.link },
      { x: 304, label: "SERVER ACTION", fill: C.muted },
      { x: 500, label: "MEASUREMENT", fill: C.accent },
    ]),
  ].join("");
  return frame({ id, title: "三个端点，三个测量问题", description: "架构图展示客户端请求如何分别进入下行载荷、上行 Discard 汇和身份查询，并在客户端完成相应测量。", eyebrow: "ARCHITECTURE · ENDPOINTS", subtitle: "garbage 产出字节；empty 接住字节；getIP 解释来源", body });
}

function garbagePipeline() {
  const id = "librespeed-go-garbage-pipeline";
  const names = [
    [56, "BOOT", "启动预热", "getRandomData(1 MiB)", C.white, C.ink],
    [224, "BUFFER", "randomData", "package variable", C.white, C.ink],
    [392, "LIMIT", "ckSize", "max = 1024", C.accentTint, C.accent],
    [560, "WRITE", "w.Write", "repeat chunks", C.white, C.ink],
    [728, "EXIT", "连接结束", "write error → break", C.white, C.ink],
  ];
  const body = [
    txt(56, 196, "STARTUP", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(392, 196, "REQUEST", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(728, 196, "CLOSE", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    ...names.map(([x, tag, title, sub, fill, stroke]) => node({ x, y: 244, width: 144, height: 88, tag, title, sub, fill, stroke, focal: tag === "LIMIT", titleSize: 12 })),
    line(200, 288, 224, 288, { stroke: C.muted, marker: `${id}-arrow` }),
    line(368, 288, 392, 288, { stroke: C.muted, marker: `${id}-arrow` }),
    line(536, 288, 560, 288, { stroke: C.muted, marker: `${id}-arrow` }),
    line(704, 288, 728, 288, { stroke: C.muted, marker: `${id}-arrow` }),
    txt(56, 392, "服务端只在启动期生成一次随机块；请求路径重复写出同一块，客户端断开时停止循环。", { fill: C.muted, size: 12, family: F.sans }),
    legend([
      { x: 136, label: "INTERNAL STEP", fill: C.muted },
      { x: 356, label: "BOUNDARY", fill: C.accent },
    ]),
  ].join("");
  return frame({ id, title: "garbage：启动预热，循环写出", description: "流程图展示 garbage 在启动时生成 1 MiB 随机数据，请求时按 ckSize 限制循环写出，并在写入错误后停止。", eyebrow: "FLOW · DOWNLINK", subtitle: "预热成本留在启动期，运行路径只重复写出已有字节", body });
}

function emptyDual() {
  const id = "librespeed-go-empty-dual-purpose";
  const body = [
    txt(64, 160, "REQUEST", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(424, 160, "SHARED HANDLER", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(720, 160, "CLIENT OBSERVATION", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    node({ x: 64, y: 196, width: 216, height: 72, tag: "GET", title: "小请求", sub: "/empty · 0 body", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 64, y: 364, width: 216, height: 72, tag: "POST", title: "大请求体", sub: "/empty · upload body", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 384, y: 280, width: 240, height: 96, tag: "SINK", title: "io.Copy → Discard", sub: "read body · close · 200 OK", focal: true, titleSize: 16 }),
    node({ x: 720, y: 196, width: 176, height: 72, tag: "RTT", title: "往返时间", sub: "client measures", titleSize: 12 }),
    node({ x: 720, y: 364, width: 176, height: 72, tag: "UPLOAD", title: "发出字节", sub: "upload progress", titleSize: 12 }),
    curve("M280,232 H328 Q336,232 336,240 V300 H384", { stroke: C.link, marker: `${id}-arrow-link` }),
    curve("M280,400 H328 Q336,400 336,392 V356 H384", { stroke: C.link, marker: `${id}-arrow-link` }),
    curve("M624,300 H664 Q672,300 672,292 V232 H720", { stroke: C.muted, marker: `${id}-arrow` }),
    curve("M624,356 H664 Q672,356 672,364 V400 H720", { stroke: C.muted, marker: `${id}-arrow` }),
    txt(64, 492, "同一个 empty Handler 先读完 body，再回 200；差异来自客户端发送了什么，而不是服务端保存了什么。", { fill: C.muted, size: 12, family: F.sans }),
    legend([
      { x: 136, label: "REQUEST", fill: C.link },
      { x: 356, label: "SHARED SINK", fill: C.accent },
    ]),
  ].join("");
  return frame({ id, title: "empty：一个 Handler，两种测量", description: "关系图展示小 GET 请求和大 POST 请求如何共用 empty Handler，并分别被客户端解释为 RTT 与上传进度。", eyebrow: "FLOW · EMPTY", subtitle: "服务端只接住并丢弃，测量解释权留在客户端", body });
}

function identityOverview() {
  const id = "librespeed-go-client-ip-overview";
  const body = [
    txt(56, 164, "REQUEST", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(280, 164, "IDENTITY", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(504, 164, "CLASSIFY", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(728, 164, "LOOKUP", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    node({ x: 56, y: 244, width: 176, height: 80, tag: "HEADERS", title: "请求来源", sub: "proxy + RemoteAddr", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 280, y: 244, width: 176, height: 80, tag: "PARSE", title: "getClientIP", sub: "normalize + fallback", focal: true, titleSize: 16 }),
    node({ x: 504, y: 244, width: 176, height: 80, tag: "CLASS", title: "特殊地址？", sub: "private / CGNAT / ULA", titleSize: 16 }),
    node({ x: 728, y: 196, width: 176, height: 72, tag: "SHORT", title: "直接展示", sub: "skip external lookup", titleSize: 12 }),
    node({ x: 728, y: 348, width: 176, height: 72, tag: "GEO", title: "GeoIP 回退", sub: "ipinfo → mmdb", titleSize: 12 }),
    line(232, 284, 280, 284, { stroke: C.link, marker: `${id}-arrow-link` }),
    line(456, 284, 504, 284, { stroke: C.muted, marker: `${id}-arrow` }),
    curve("M680,260 H704 Q712,260 712,252 V232 H728", { stroke: C.muted, marker: `${id}-arrow` }),
    curve("M680,308 H704 Q712,308 712,356 V384 H728", { stroke: C.muted, marker: `${id}-arrow` }),
    arrowLabel(240, 264, 40, "PARSE", C.link),
    arrowLabel(464, 264, 40, "CHECK"),
    txt(56, 468, "坏头部不是终点：每个候选先校验，失败后继续降级；这些头适合展示，不适合作为访问控制。", { fill: C.muted, size: 12, family: F.sans }),
    legend([
      { x: 136, label: "CLIENT INPUT", fill: C.link },
      { x: 356, label: "FALLBACK", fill: C.muted },
      { x: 500, label: "FOCUS", fill: C.accent },
    ]),
  ].join("");
  return frame({ id, title: "getIP：从头部到展示结果", description: "架构图展示请求头经过客户端 IP 归一化、特殊地址分类后，或短路展示，或继续进入在线与离线 GeoIP 查询。", eyebrow: "ARCHITECTURE · IDENTITY", subtitle: "先确认你是谁，再决定是否需要向外部 GeoIP 查询", body });
}

function priorityChain() {
  const id = "librespeed-go-proxy-priority-chain";
  const items = [
    ["CF-Connecting-IPv6", "valid IPv6"],
    ["Client-IP", "parse IP"],
    ["X-Real-IP", "parse IP"],
    ["X-Forwarded-For", "first item"],
    ["RemoteAddr", "last fallback"],
  ];
  const width = 144;
  const gap = 24;
  const start = (960 - (items.length * width + (items.length - 1) * gap)) / 2;
  const y = 244;
  let body = txt(72, 196, "HIGH PRIORITY", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 });
  body += txt(728, 196, "LOW PRIORITY", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 });
  items.forEach(([title, sub], index) => {
    const x = start + index * (width + gap);
    body += node({ x, y, width, height: 88, tag: `P${index + 1}`, title, sub, fill: C.linkTint, stroke: C.link, titleSize: title.length > 12 ? 12 : 16 });
    if (index < items.length - 1) body += line(x + width, y + 44, x + width + gap, y + 44, { stroke: C.link, marker: `${id}-arrow-link` });
  });
  body += txt(72, 392, "候选无效 → 向右降级；归一化包含去空白、XFF 取首段、net.ParseIP 与 IPv4-mapped IPv6 处理。", { fill: C.muted, size: 12, family: F.sans });
  body += legend([{ x: 136, label: "CANDIDATE ORDER", fill: C.link }, { x: 356, label: "FALLBACK →", fill: C.muted }]);
  return frame({ id, title: "五级代理头：校验后逐级降级", description: "优先级图展示 getClientIP 从 CF-Connecting-IPv6 到 RemoteAddr 的候选顺序，以及候选失败时继续向后回退。", eyebrow: "PRIORITY · PROXY HEADERS", subtitle: "顺序是合同，校验是边界，失败不是异常而是降级", body });
}

function specialIpTable() {
  return tableBody({
    id: "librespeed-go-special-ip-table",
    title: "特殊地址先分类，再决定是否外呼",
    description: "分类表列出 localhost、link-local、私有 IPv4、ULA IPv6 和 CGNAT 的匹配范围及其处理路径。",
    eyebrow: "TABLE · ADDRESS CLASSIFICATION",
    subtitle: "同一张表同时承担边界说明和外部查询短路条件",
    columns: [{ label: "分类", width: 220 }, { label: "匹配", width: 300 }, { label: "处理", width: 312 }],
    focusIndex: 3,
    rows: [
      [{ title: "localhost", size: 12 }, { title: "::1 · 127.*", mono: true, size: 8 }, { title: "直接返回本地描述", size: 12 }],
      [{ title: "link-local", size: 12 }, { title: "fe80: · 169.254.*", mono: true, size: 8 }, { title: "直接分类，不查 ISP", size: 12 }],
      [{ title: "私有 IPv4", size: 12 }, { title: "10.* · 172.16–31.* · 192.168.*", mono: true, size: 8 }, { title: "内网来源说明", size: 12 }],
      [{ title: "ULA IPv6", size: 12 }, { title: "fc00::/7 · ip[0]&0xFE", mono: true, size: 8 }, { title: "位运算分类", size: 12 }],
      [{ title: "CGNAT", size: 12 }, { title: "100.64.0.0/10", mono: true, size: 8 }, { title: "运营商 NAT 说明", size: 12 }],
    ],
  });
}

function sequenceDiagram({ id, title, description, eyebrow, subtitle, actors, messages, note }) {
  const centers = [176, 480, 784];
  const actorWidth = 176;
  const messageStep = messages.length > 8 ? 28 : 36;
  const lifelineEnd = messages.length >= 8 ? 508 : 480;
  let body = note ? txt(64, 144, note, { fill: C.muted, size: 12, family: F.sans }) : "";
  centers.forEach((center) => { body += line(center, 216, center, lifelineEnd, { stroke: C.rule, strokeWidth: 0.8, dash: "5,4" }); });
  messages.forEach((message, index) => {
    const y = 248 + index * messageStep;
    const from = centers[message.from];
    const to = centers[message.to];
    body += line(from, y, to, y, { stroke: message.color ?? C.muted, marker: `${id}-${message.accent ? "arrow-accent" : "arrow"}`, dash: message.dash });
    const left = Math.min(from, to);
    const right = Math.max(from, to);
    const labelWidth = message.width ?? 112;
    const labelX = Math.round((left + right) / 2 - labelWidth / 2);
    body += arrowLabel(labelX, y - 20, labelWidth, message.label, message.accent ? C.accent : C.soft);
  });
  actors.forEach((actor, index) => { body += node({ x: centers[index] - actorWidth / 2, y: 160, width: actorWidth, height: 56, tag: actor.tag, title: actor.title, sub: actor.sub, fill: actor.fill ?? C.white, stroke: actor.stroke ?? C.ink, titleSize: 12 }); });
  body += legend([{ x: 136, label: "MESSAGE", fill: C.muted }, { x: 356, label: "ACTOR", fill: C.ink }]);
  return frame({ id, title, description, eyebrow, subtitle, body });
}

function contractSequence() {
  return sequenceDiagram({
    id: "librespeed-go-contract-sequence",
    title: "Worker 合同：字符串驱动一次测速",
    description: "时序图展示主线程把 settings 交给 Worker，Worker 按 test_order 与 Go 服务端交互，并把进度与最终 ID 返回。",
    eyebrow: "SEQUENCE · WORKER CONTRACT",
    subtitle: "主线程展示进度，Worker 承担 HTTP 交互，服务端只发字节或接住字节",
    note: 'test_order = "IP_D_U" · 字符 P 只有被显式写入时才会触发 Ping/Jitter',
    actors: [
      { tag: "MAIN", title: "主线程", sub: "postMessage" },
      { tag: "WORKER", title: "Web Worker", sub: "runNextTest" },
      { tag: "SERVER", title: "Go 服务端", sub: "HTTP handlers" },
    ],
    messages: [
      { from: 0, to: 1, label: "START + SETTINGS", width: 140 },
      { from: 1, to: 2, label: "GET /getIP", width: 96, color: C.link },
      { from: 2, to: 1, label: "IP / ISP JSON", width: 112, dash: "5,4" },
      { from: 1, to: 2, label: "GET /garbage", width: 112, color: C.link },
      { from: 2, to: 1, label: "random bytes", width: 112, dash: "5,4" },
      { from: 1, to: 0, label: "PROGRESS", width: 96 },
      { from: 1, to: 2, label: "POST telemetry", width: 120, color: C.link },
      { from: 2, to: 1, label: "id ULID", width: 80, dash: "5,4", accent: true },
    ],
  });
}

function flowSvg({ id, title, description, eyebrow, subtitle, items, note, focalIndex = -1 }) {
  const width = 144;
  const gap = 24;
  const start = (960 - (items.length * width + (items.length - 1) * gap)) / 2;
  const y = 244;
  let body = note ? txt(56, 184, note, { fill: C.muted, size: 12, family: F.sans }) : "";
  items.forEach((item, index) => {
    const x = start + index * (width + gap);
    body += node({ x, y, width, height: 88, tag: item.tag, title: item.title, sub: item.sub, fill: index === focalIndex ? C.accentTint : item.fill ?? C.white, stroke: index === focalIndex ? C.accent : item.stroke ?? C.ink, focal: index === focalIndex, titleSize: item.titleSize ?? 12 });
    if (index < items.length - 1) body += line(x + width, y + 44, x + width + gap, y + 44, { stroke: index === focalIndex ? C.accent : C.muted, marker: `${id}-${index === focalIndex ? "arrow-accent" : "arrow"}` });
  });
  body += legend([{ x: 136, label: "STEP", fill: C.muted }, { x: 356, label: "FOCUS", fill: C.accent }]);
  return frame({ id, title, description, eyebrow, subtitle, body });
}

function obfuscationFlow() {
  return flowSvg({
    id: "librespeed-go-obfuscation-flow",
    title: "Telemetry ID：ULID 先生成，再做有限混淆",
    description: "流程图展示遥测记录生成 ULID，选择性 XOR 前 4 字节，再返回 base64url 形式并由 ResolveID 还原。",
    eyebrow: "FLOW · ID OBFUSCATION",
    subtitle: "防止顺手枚举，不等于密码学保密",
    note: "目标：阻止 casual guessing · 注释明确声明 NOT cryptographically secure",
    focalIndex: 2,
    items: [
      { tag: "INPUT", title: "Telemetry", sub: "record fields", fill: C.linkTint, stroke: C.link },
      { tag: "ID", title: "ULID", sub: "time + entropy" },
      { tag: "XOR", title: "前 4 字节", sub: "salt · reversible" },
      { tag: "OUTPUT", title: "base64url ID", sub: "response body" },
      { tag: "READ", title: "ResolveID", sub: "JSON / PNG / stats" },
    ],
  });
}

function measurementAuthority() {
  const id = "librespeed-go-measurement-authority";
  const body = [
    txt(72, 164, "CLIENT", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(392, 164, "SERVER", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(720, 164, "MEASUREMENT POINT", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(72, 208, "DOWNLOAD", { fill: C.link, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(72, 368, "UPLOAD", { fill: C.link, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    node({ x: 72, y: 228, width: 220, height: 80, tag: "GET", title: "请求 /garbage", sub: "client receives", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 392, y: 228, width: 220, height: 80, tag: "WRITE", title: "w.Write(randomData)", sub: "server emits bytes", titleSize: 12 }),
    node({ x: 720, y: 228, width: 176, height: 80, tag: "COUNT", title: "客户端计量", sub: "bytes received", focal: true, titleSize: 12 }),
    node({ x: 72, y: 388, width: 220, height: 80, tag: "POST", title: "发送 request body", sub: "upload progress", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 392, y: 388, width: 220, height: 80, tag: "SINK", title: "io.Copy → Discard", sub: "server reads body", titleSize: 12 }),
    node({ x: 720, y: 388, width: 176, height: 80, tag: "COUNT", title: "xhr.upload", sub: "bytes handed to stack", focal: true, titleSize: 12 }),
    line(292, 268, 392, 268, { stroke: C.link, marker: `${id}-arrow-link` }),
    line(612, 268, 720, 268, { stroke: C.muted, marker: `${id}-arrow` }),
    line(292, 428, 392, 428, { stroke: C.link, marker: `${id}-arrow-link` }),
    line(612, 428, 720, 428, { stroke: C.muted, marker: `${id}-arrow` }),
    txt(72, 512, "下行的客户端统计接收字节；上行的客户端统计 upload progress。服务端的职责是提供/接收数据，不自动获得同一计量权。", { fill: C.muted, size: 12, family: F.sans }),
    legend([{ x: 136, label: "HTTP PATH", fill: C.link }, { x: 356, label: "SERVER ACTION", fill: C.muted }, { x: 560, label: "MEASUREMENT", fill: C.accent }]),
  ].join("");
  return frame({ id, title: "不对称的计量权：字节经过哪一侧才算数", description: "双轨图对照下行和上行的字节路径，标出服务端发出或接收数据与客户端实际计量点之间的差异。", eyebrow: "TWO TRACKS · MEASUREMENT", subtitle: "同样是字节流，计量点却分别落在客户端的接收和上传进度", body });
}

function routesTable() {
  return tableBody({
    id: "librespeed-go-routes-table",
    title: "12 条逻辑路由，三种挂载形态",
    description: "接口表按功能面列出 LibreSpeed Go 的主要逻辑路由、HTTP 方法和消费者，并说明 backend 与 PHP 兼容形态。",
    eyebrow: "TABLE · ROUTE CONTRACT",
    subtitle: "先看稳定的逻辑端点，再把路径兼容视为同一份 API 合同",
    rowHeight: 40,
    tableY: 148,
    columns: [{ label: "功能面", width: 160 }, { label: "现代路径", width: 276 }, { label: "方法", width: 112 }, { label: "消费者 / 语义", width: 284 }],
    focusIndex: 2,
    rows: [
      [{ title: "静态资源" }, { title: "/*", mono: true, size: 8 }, { title: "GET", mono: true, size: 8 }, { title: "浏览器 · embed / assets" }],
      [{ title: "下行" }, { title: "/garbage", mono: true, size: 8 }, { title: "GET", mono: true, size: 8 }, { title: "Worker · random bytes" }],
      [{ title: "上行 / 延迟" }, { title: "/empty", mono: true, size: 8 }, { title: "GET/POST", mono: true, size: 8 }, { title: "Worker · Discard / RTT" }],
      [{ title: "身份" }, { title: "/getIP", mono: true, size: 8 }, { title: "GET", mono: true, size: 8 }, { title: "Worker · IP / ISP / distance" }],
      [{ title: "遥测上报" }, { title: "/results/telemetry", mono: true, size: 8 }, { title: "POST", mono: true, size: 8 }, { title: "Worker · ULID" }],
      [{ title: "结果读取" }, { title: "/results/json · /results", mono: true, size: 8 }, { title: "GET", mono: true, size: 8 }, { title: "API / PNG share" }],
      [{ title: "管理面" }, { title: "/stats", mono: true, size: 8 }, { title: "GET/POST", mono: true, size: 8 }, { title: "管理员 · session" }],
    ],
  });
}

function adminFlow() {
  return flowSvg({
    id: "librespeed-go-admin-session",
    title: "/stats：会话 Cookie 只守住管理面",
    description: "流程图展示 stats 请求经过密码哨兵判断、登录验证、session cookie 和结果查询的路径。",
    eyebrow: "FLOW · ADMIN SESSION",
    subtitle: "PASSWORD 哨兵表示未配置；正确密码才建立一小时的 logged 会话",
    note: 'key = securecookie.GenerateRandomKey(32) · 进程重启会生成新 key',
    focalIndex: 2,
    items: [
      { tag: "REQUEST", title: "GET /stats", sub: "op · id" },
      { tag: "GUARD", title: "密码哨兵", sub: '"PASSWORD" = off' },
      { tag: "LOGIN", title: "session cookie", sub: "logged · HttpOnly" },
      { tag: "QUERY", title: "L100 / UUID", sub: "FetchLast100" },
      { tag: "HTML", title: "stats page", sub: "render records" },
    ],
  });
}

function curlSequence() {
  return sequenceDiagram({
    id: "librespeed-go-curl-sequence",
    title: "curl 会话：从身份到结果读取",
    description: "时序图展示 curl 依次调用 getIP、garbage、empty、telemetry、JSON、PNG 和 stats 接口的可复现路径。",
    eyebrow: "SEQUENCE · REPRODUCTION",
    subtitle: "每一步都是一个可单独复现的 HTTP 合同，不把完整会话误写成单次请求",
    note: "T0–T10 · 真实 session 日志记录请求、响应与结果 ID",
    actors: [
      { tag: "CURL", title: "curl", sub: "request script" },
      { tag: "HTTP", title: "Go server", sub: "chi router" },
      { tag: "DATA", title: "results / DB", sub: "Record + Fetch" },
    ],
    messages: [
      { from: 0, to: 1, label: "GET /getIP", width: 96, color: C.link },
      { from: 1, to: 0, label: "JSON", width: 64, dash: "5,4" },
      { from: 0, to: 1, label: "GET /garbage", width: 112, color: C.link },
      { from: 0, to: 1, label: "POST /empty", width: 104, color: C.link },
      { from: 0, to: 1, label: "POST telemetry", width: 120, color: C.link },
      { from: 1, to: 2, label: "Insert", width: 72 },
      { from: 2, to: 1, label: "id ULID", width: 80, dash: "5,4" },
      { from: 0, to: 1, label: "GET JSON / PNG", width: 128, color: C.link },
      { from: 1, to: 2, label: "Fetch", width: 72 },
      { from: 0, to: 1, label: "POST login", width: 96, color: C.link },
    ],
  });
}

function lifecycleTimeline() {
  const id = "librespeed-go-lifecycle-timeline";
  const items = [
    [56, "I", "身份", "GET /getIP"],
    [204, "D", "下行", "6 streams"],
    [352, "U", "上行", "3 POST"],
    [500, "P", "延迟", "10 samples"],
    [648, "T", "上报", "FormData"],
    [796, "R", "读取", "JSON / PNG"],
  ];
  let body = line(120, 304, 848, 304, { stroke: C.muted, marker: `${id}-arrow` });
  items.forEach(([x, tag, title, sub], index) => {
    body += node({ x, y: 260, width: 128, height: 88, tag, title, sub, fill: index === 1 ? C.accentTint : C.white, stroke: index === 1 ? C.accent : C.ink, focal: index === 1, titleSize: 16 });
  });
  body += txt(56, 404, "时间线只表示 Worker 的阶段顺序；每个阶段内部仍可能有并发请求和独立失败。", { fill: C.muted, size: 12, family: F.sans });
  body += legend([{ x: 136, label: "PHASE", fill: C.muted }, { x: 356, label: "DOWNLINK FOCUS", fill: C.accent }]);
  return frame({ id, title: "一次测速的时间线：I → D → U → P → T → R", description: "时间线展示一次测速从身份请求、下行、上行、延迟、遥测上报到结果读取的阶段顺序。", eyebrow: "TIMELINE · FULL LIFECYCLE", subtitle: "阶段顺序是主线，并发连接和收尾算法是阶段内部的细节", body });
}

function rateFilter() {
  return flowSvg({
    id: "librespeed-go-rate-filter",
    title: "稳态速率：先切掉坡道，再处理样本",
    description: "流程图展示下行速率从 grace time 之后的离散样本，到排序、截尾和最终均值的处理过程。",
    eyebrow: "FLOW · RATE FILTER",
    subtitle: "图表达算法顺序，不把某次设备的样本值包装成通用阈值",
    note: "每个样本来自 ΔBytes / Δt · grace 期内的坡道不进入最终分母",
    focalIndex: 3,
    items: [
      { tag: "GRACE", title: "重置窗口", sub: "drop ramp-up" },
      { tag: "SAMPLE", title: "100ms 样本", sub: "ΔBytes / 0.1s" },
      { tag: "SORT", title: "排序", sub: "low → high" },
      { tag: "TRIM", title: "截去两端", sub: "remove tails" },
      { tag: "MEAN", title: "稳态均值", sub: "display value" },
    ],
  });
}

function jitterFormula() {
  const id = "librespeed-go-jitter-formula";
  const body = [
    txt(80, 164, "INPUT", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(360, 164, "INSTANT", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(640, 164, "STATE UPDATE", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    node({ x: 80, y: 212, width: 208, height: 96, tag: "DELAY", title: "delay[i]", sub: "delay[i-1]", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 360, y: 212, width: 208, height: 96, tag: "DELTA", title: "|delay[i] − delay[i−1]|", sub: "instjitter", focal: true, titleSize: 12 }),
    node({ x: 640, y: 212, width: 240, height: 96, tag: "JITTER", title: "方向不对称更新", sub: "0.7 spike · 0.2 recovery", titleSize: 12 }),
    line(288, 260, 360, 260, { stroke: C.link, marker: `${id}-arrow-link` }),
    line(568, 260, 640, 260, { stroke: C.muted, marker: `${id}-arrow` }),
    box(80, 364, 800, 72, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 }),
    txt(104, 396, "ping = min(samples)", { fill: C.ink, size: 16, family: F.mono, weight: 500 }),
    txt(424, 396, "J↑ = 0.3J + 0.7Δ", { fill: C.accent, size: 12, family: F.mono, weight: 600 }),
    txt(656, 396, "J↓ = 0.8J + 0.2Δ", { fill: C.muted, size: 12, family: F.mono }),
    txt(80, 488, "这是 Worker 的估计公式；它说明响应速度与遗忘速度不同，不等于 RFC 3550 的原样实现。", { fill: C.muted, size: 12, family: F.sans }),
    legend([{ x: 136, label: "SAMPLE", fill: C.link }, { x: 356, label: "FOCUS", fill: C.accent }]),
  ].join("");
  return frame({ id, title: "Ping 取最小值，Jitter 按方向加权", description: "公式图展示相邻延迟样本如何生成瞬时抖动，以及抖动上升和回落时使用不同权重；同时标出 ping 的最小值规则。", eyebrow: "FORMULA · PING / JITTER", subtitle: "最小值估计固有延迟，非对称权重保留恶化方向", body });
}

function telemetryOverview() {
  return flowSvg({
    id: "librespeed-go-telemetry-overview",
    title: "Record：数据先经过开关，再进入存储",
    description: "流程图展示一次遥测上报经过 none 开关、字段提取、可选脱敏、ULID 生成和 database.DB.Insert 的路径。",
    eyebrow: "FLOW · TELEMETRY",
    subtitle: "隐私边界在写入前发生，ID 混淆发生在返回给调用方时",
    note: 'database_type = "none" → 不写入，并回答 Telemetry is disabled',
    focalIndex: 2,
    items: [
      { tag: "POST", title: "Record", sub: "form + request" },
      { tag: "GATE", title: "none？", sub: "write or stop" },
      { tag: "REDACT", title: "RedactIP", sub: "optional regex" },
      { tag: "ULID", title: "生成 ID", sub: "timestamp + entropy" },
      { tag: "INSERT", title: "database.DB", sub: "DataAccess" },
    ],
  });
}

function redactionFlow() {
  const id = "librespeed-go-redaction-flow";
  const body = [
    txt(64, 164, "CARRIERS", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(376, 164, "PATTERNS", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(688, 164, "PLACEHOLDERS", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    node({ x: 64, y: 212, width: 240, height: 96, tag: "INPUT", title: "IP / ispinfo / log", sub: "RemoteAddr + forms", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 376, y: 212, width: 240, height: 96, tag: "REGEX", title: "IPv4 · IPv6 · hostname", sub: "replace in two carriers", focal: true, titleSize: 12 }),
    node({ x: 688, y: 212, width: 208, height: 96, tag: "OUTPUT", title: "0.0.0.0 · ::", sub: '"hostname":"REDACTED"', titleSize: 12 }),
    line(304, 260, 376, 260, { stroke: C.link, marker: `${id}-arrow-link` }),
    line(616, 260, 688, 260, { stroke: C.muted, marker: `${id}-arrow` }),
    box(64, 364, 832, 72, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 }),
    txt(88, 396, "语法形状也要保留：hostname 替换为 JSON 片段，而不是裸字符串。", { fill: C.ink, size: 16, family: F.sans, weight: 600 }),
    legend([{ x: 136, label: "INPUT", fill: C.link }, { x: 356, label: "REDACTION FOCUS", fill: C.accent }]),
  ].join("");
  return frame({ id, title: "RedactIP：两份载体，三类模式，统一占位符", description: "数据流图展示 RemoteAddr、ispinfo 和 log 经过 IPv4、IPv6、hostname 三类正则后写入脱敏占位符。", eyebrow: "DATA FLOW · PRIVACY", subtitle: "脱敏理解字段载体的语法，而不是只做字符串替换", body });
}

function databaseTable() {
  return tableBody({
    id: "librespeed-go-database-backends",
    title: "DataAccess：七个后端，共用三个操作",
    description: "表格列出 DataAccess 接口的三个方法和 commit 59cff12 中配置可选择的七种后端。",
    eyebrow: "TABLE · STORAGE ADAPTERS",
    subtitle: "接口窄，后端可替换；none 与 memory 也是明确的运行模式",
    rowHeight: 40,
    tableY: 148,
    columns: [{ label: "后端", width: 220 }, { label: "实现形态", width: 260 }, { label: "可见语义", width: 352 }],
    focusIndex: 6,
    rows: [
      [{ title: "postgresql", mono: true, size: 8 }, { title: "SQL / external", mono: true, size: 8 }, { title: "持久化" }],
      [{ title: "mysql", mono: true, size: 8 }, { title: "SQL / external", mono: true, size: 8 }, { title: "持久化" }],
      [{ title: "mssql", mono: true, size: 8 }, { title: "SQL / external", mono: true, size: 8 }, { title: "持久化" }],
      [{ title: "sqlite", mono: true, size: 8 }, { title: "file / modernc", mono: true, size: 8 }, { title: "本地文件" }],
      [{ title: "bolt", mono: true, size: 8 }, { title: "file / bbolt", mono: true, size: 8 }, { title: "本地文件" }],
      [{ title: "memory", mono: true, size: 8 }, { title: "in-process", mono: true, size: 8 }, { title: "测试 / 取证" }],
      [{ title: "none", mono: true, size: 8 }, { title: "no-op", mono: true, size: 8 }, { title: "关闭遥测写入" }],
    ],
  });
}

function configTable() {
  return tableBody({
    id: "librespeed-go-config-contract",
    title: "配置键先问：谁在读，失败去哪",
    description: "配置表列出 database_type、statistics_password、download_chunks 和 distance_unit 的默认值及实际消费状态。",
    eyebrow: "TABLE · CONFIG AUDIT",
    subtitle: "默认值是行为；死键也是行为，只是它不会按文档改变系统",
    columns: [{ label: "键", width: 240 }, { label: "默认值", width: 180 }, { label: "当前消费者", width: 220 }, { label: "边界", width: 192 }],
    focusIndex: 0,
    rows: [
      [{ title: "database_type", mono: true, size: 8 }, { title: "postgresql", mono: true, size: 8 }, { title: "database.SetDBInfo" }, { title: "裸跑可能连 localhost" }],
      [{ title: "statistics_password", mono: true, size: 8 }, { title: '"PASSWORD"', mono: true, size: 8 }, { title: "Stats" }, { title: "哨兵 = 未配置" }],
      [{ title: "download_chunks", mono: true, size: 8 }, { title: "4", mono: true, size: 8 }, { title: "无消费者" }, { title: "garbage 硬编码 4" }],
      [{ title: "distance_unit", mono: true, size: 8 }, { title: "K", mono: true, size: 8 }, { title: "无消费者" }, { title: "请求参数决定单位" }],
    ],
  });
}

function viperPriority() {
  const id = "librespeed-go-viper-priority";
  const items = [
    ["CLI", "explicit config path"],
    ["ENV", "SPEEDTEST_*"],
    ["FILE", "settings.toml"],
    ["DEFAULT", "SetDefault"],
  ];
  const width = 176;
  const gap = 32;
  const start = (960 - (items.length * width + (items.length - 1) * gap)) / 2;
  let body = txt(56, 196, "HIGHER PRECEDENCE", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 });
  items.forEach(([title, sub], index) => {
    const x = start + index * (width + gap);
    body += node({ x, y: 244, width, height: 88, tag: `L${index + 1}`, title, sub, fill: index === 0 ? C.accentTint : C.white, stroke: index === 0 ? C.accent : C.ink, focal: index === 0, titleSize: 16 });
    if (index < items.length - 1) body += line(x + width, 288, x + width + gap, 288, { stroke: C.muted, marker: `${id}-arrow` });
  });
  body += txt(56, 392, "viper 读取顺序只能说明配置来源优先级；具体键是否被消费，还要回到调用点检查。", { fill: C.muted, size: 12, family: F.sans });
  body += legend([{ x: 136, label: "PRECEDENCE", fill: C.muted }, { x: 356, label: "HIGHEST", fill: C.accent }]);
  return frame({ id, title: "Viper：来源有优先级，键还要有消费者", description: "优先级图展示 CLI、环境变量、配置文件和编译默认值的覆盖顺序，并提醒配置来源顺序不等于每个键都生效。", eyebrow: "PRIORITY · CONFIG", subtitle: "覆盖顺序解决“从哪来”，调用点解决“有没有用”", body });
}

function deploymentTopology() {
  const id = "librespeed-go-deployment-surfaces";
  const body = [
    txt(56, 164, "REPOSITORY ARTIFACTS", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(376, 164, "RUNTIME ENTRY", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    txt(688, 164, "HTTP SERVICE", { fill: C.soft, size: 8, family: F.mono, weight: 500, spacing: 0.14 }),
    node({ x: 56, y: 276, width: 208, height: 88, tag: "BUILD", title: "单二进制", sub: "main.go + assets", fill: C.linkTint, stroke: C.link, titleSize: 16 }),
    node({ x: 376, y: 196, width: 208, height: 72, tag: "DIRECT", title: "直接监听", sub: "net.Listen", titleSize: 12 }),
    node({ x: 376, y: 292, width: 208, height: 72, tag: "DOCKER", title: "Dockerfile", sub: "container entry", titleSize: 12 }),
    node({ x: 376, y: 388, width: 208, height: 72, tag: "SYSTEMD", title: "socket activation", sub: "Linux build tag", titleSize: 12 }),
    node({ x: 688, y: 292, width: 208, height: 88, tag: "HTTP", title: "chi router", sub: "same route surface", focal: true, titleSize: 16 }),
    curve("M264,320 H320 Q328,320 328,312 V232 H376", { stroke: C.link, marker: `${id}-arrow-link` }),
    curve("M264,344 H320 Q328,344 328,428 H376", { stroke: C.link, marker: `${id}-arrow-link` }),
    curve("M584,232 H632 Q640,232 640,240 V304 Q640,312 648,312 H688", { stroke: C.muted, marker: `${id}-arrow` }),
    curve("M584,328 H680 Q688,328 688,336", { stroke: C.muted, marker: `${id}-arrow` }),
    curve("M584,428 H632 Q640,428 640,420 V368 Q640,360 648,360 H688", { stroke: C.muted, marker: `${id}-arrow` }),
    txt(56, 496, "这里展示仓库明确提供的部署入口，不把未在本机或仓库中验证的 K8s、CDN 或生产容量写成实现事实。", { fill: C.muted, size: 12, family: F.sans }),
    legend([{ x: 136, label: "ARTIFACT PATH", fill: C.link }, { x: 356, label: "SERVER SURFACE", fill: C.muted }, { x: 560, label: "FOCUS", fill: C.accent }]),
  ].join("");
  return frame({ id, title: "部署面：同一套路由，三种运行入口", description: "部署图展示单二进制如何通过直接监听、Dockerfile 或 Linux systemd socket activation 进入同一套 chi HTTP 路由。", eyebrow: "ARCHITECTURE · DEPLOYMENT", subtitle: "区分仓库提供的运行入口与尚未验证的生产拓扑", body });
}

const outputs = [
  { article: "02", files: [
    ["librespeed-go-endpoints-garbage-empty-backend", endpointOverview()],
    ["garbage-chunk-writer-zero-alloc-pipeline", garbagePipeline()],
    ["empty-endpoint-dual-purpose-sink", emptyDual()],
  ] },
  { article: "03", files: [
    ["librespeed-go-client-ip-proxy-cgnat-lookup", identityOverview()],
    ["client-ip-five-level-proxy-chain", priorityChain()],
    ["special-ip-subnet-classification-matrix", specialIpTable()],
  ] },
  { article: "04", files: [
    ["librespeed-go-contract-worker-lifecycle-script", contractSequence()],
    ["librespeed-go-telemetry-ulid-obfuscation", obfuscationFlow()],
    ["asymmetric-measurement-authority-flow", measurementAuthority()],
  ] },
  { article: "05", files: [
    ["librespeed-go-interface-routes-specification", routesTable()],
    ["librespeed-go-admin-session-security", adminFlow()],
    ["librespeed-go-rest-curl-sequence", curlSequence()],
  ] },
  { article: "06", files: [
    ["librespeed-go-speedtest-full-lifecycle-timeline", lifecycleTimeline()],
    ["librespeed-go-p90-trimmed-mean-filter", rateFilter()],
    ["librespeed-go-latency-jitter-filter-math", jitterFormula()],
  ] },
  { article: "07", files: [
    ["librespeed-go-telemetry-ulid-xor-desensitization", telemetryOverview()],
    ["librespeed-go-ip-redaction-four-step", redactionFlow()],
    ["librespeed-go-database-driver-matrix", databaseTable()],
  ] },
  { article: "08", files: [
    ["librespeed-go-config-deploy-graceful-downgrade", configTable()],
    ["viper-config-hierarchy-precedence", viperPriority()],
    ["librespeed-go-cloud-native-deploy-topology", deploymentTopology()],
  ] },
];

await mkdir(evidenceRoot, { recursive: true });
for (const group of outputs) {
  const articleDir = path.join(evidenceRoot, group.article);
  await mkdir(articleDir, { recursive: true });
  for (const [name, svg] of group.files) {
    const htmlPath = path.join(articleDir, `${name}.html`);
    const svgPath = path.join(imageRoot, `${name}.svg`);
    await writeFile(htmlPath, htmlPage(name, svg), "utf8");
    const html = await readFile(htmlPath, "utf8");
    await writeFile(svgPath, exportSvg(html), "utf8");
    console.log(`${group.article}: ${name}`);
  }
}
