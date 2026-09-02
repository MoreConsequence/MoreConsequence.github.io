import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const evidenceDir = path.join(
  repoRoot,
  "evidence/speedtest-engineering/2026-08-31-speedtest-whitepaper-redesign",
);
const imageDir = path.join(repoRoot, "public/images");

const C = {
  paper: "#f5f5f5",
  paper2: "#ececec",
  ink: "#2d3142",
  muted: "#4f5d75",
  soft: "#7a8399",
  rule: "rgba(45,49,66,0.14)",
  accent: "#eb6c36",
  accentTint: "rgba(235,108,54,0.08)",
  link: "#2e5aa8",
  linkTint: "rgba(46,90,168,0.07)",
  white: "#ffffff",
};

const F = {
  sans: "'Geist', 'Noto Sans SC', 'PingFang SC', sans-serif",
  mono: "'Geist Mono', 'Noto Sans SC', monospace",
  serif: "'Instrument Serif', 'Noto Serif SC', 'Songti SC', serif",
};

const fontLink =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600&family=Noto+Serif+SC:wght@400&display=swap";
const svgFontImport =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;family=Noto+Sans+SC:wght@400;500;600&amp;family=Noto+Serif+SC:wght@400&amp;display=swap');</style>";

let activeLayout = null;

function startLayout(id) {
  activeLayout = { id, nodes: [], labels: [], connectors: [] };
}

function estimateTextWidth(value, size) {
  return [...String(value)].reduce((total, character) => {
    if (/[⺀-鿿]/.test(character)) return total + size;
    if (character === " ") return total + size * 0.35;
    return total + size * 0.62;
  }, 0);
}

function pathSegments(d) {
  const segments = [];
  let current = null;
  for (const match of d.matchAll(/([MHVQ])([^MHVQ]*)/g)) {
    const command = match[1];
    const numbers = [...match[2].matchAll(/-?d+(?:.d+)?/g)].map((item) => Number(item[0]));
    if (command === "M" && numbers.length >= 2) {
      current = { x: numbers[0], y: numbers[1] };
      continue;
    }
    if (!current) continue;
    if (command === "H") {
      for (const x of numbers) {
        const next = { x, y: current.y };
        segments.push([current.x, current.y, next.x, next.y]);
        current = next;
      }
    } else if (command === "V") {
      for (const y of numbers) {
        const next = { x: current.x, y };
        segments.push([current.x, current.y, next.x, next.y]);
        current = next;
      }
    } else if (command === "Q") {
      for (let index = 0; index + 3 < numbers.length; index += 4) {
        const control = { x: numbers[index], y: numbers[index + 1] };
        const next = { x: numbers[index + 2], y: numbers[index + 3] };
        segments.push([current.x, current.y, control.x, control.y]);
        segments.push([control.x, control.y, next.x, next.y]);
        current = next;
      }
    }
  }
  return segments;
}

function segmentHitsRect(x1, y1, x2, y2, rect, padding = 0) {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  if (x1 === x2) return x1 >= left && x1 <= right && Math.max(y1, y2) >= top && Math.min(y1, y2) <= bottom;
  if (y1 === y2) return y1 >= top && y1 <= bottom && Math.max(x1, x2) >= left && Math.min(x1, x2) <= right;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return maxX >= left && minX <= right && maxY >= top && minY <= bottom;
}

function segmentHitsNodeInterior(x1, y1, x2, y2, nodeRecord) {
  const inset = 1;
  return segmentHitsRect(x1, y1, x2, y2, {
    x: nodeRecord.x + inset,
    y: nodeRecord.y + inset,
    width: nodeRecord.width - inset * 2,
    height: nodeRecord.height - inset * 2,
  });
}

function validateLayout(id) {
  if (!activeLayout || activeLayout.id !== id) throw new Error(`Layout context ${id} was not initialized`);

  for (const record of activeLayout.nodes) {
    const safeLeft = record.x + 10;
    const safeRight = record.x + record.width - 10;
    const tagLeft = record.x + 12 + 4;
    const tagRight = record.x + 12 + record.tagWidth - 4;
    const tagWidth = estimateTextWidth(record.tag, 8);
    if (record.x + 12 + record.tagWidth / 2 - tagWidth / 2 < tagLeft || record.x + 12 + record.tagWidth / 2 + tagWidth / 2 > tagRight) {
      throw new Error(`Node tag ${record.tag} is too close to its border`);
    }

    const titleSpan = (record.titleLines.length - 1) * 16;
    const titleTop = record.startY - record.titleSize * 0.85;
    const titleBottom = record.startY + titleSpan + record.titleSize * 0.3;
    const safeBottom = record.sub ? record.subY - 4 : record.y + record.height - 8;
    if (titleTop < record.y + 29 || titleBottom > safeBottom) {
      throw new Error(`Node ${record.tag} title collides with tag/subtitle area`);
    }
    for (const title of record.titleLines) {
      const width = estimateTextWidth(title, record.titleSize);
      if (record.x + record.width / 2 - width / 2 < safeLeft || record.x + record.width / 2 + width / 2 > safeRight) {
        throw new Error(`Node ${record.tag} title ${title} exceeds its safe inner width`);
      }
    }
    if (record.sub) {
      const width = estimateTextWidth(record.sub, 8);
      if (record.x + record.width / 2 - width / 2 < safeLeft || record.x + record.width / 2 + width / 2 > safeRight) {
        throw new Error(`Node ${record.tag} subtitle exceeds its safe inner width`);
      }
    }
  }

  for (const labelRecord of activeLayout.labels) {
    const width = estimateTextWidth(labelRecord.value, 8);
    if (labelRecord.x + labelRecord.width / 2 - width / 2 < labelRecord.x + 2 || labelRecord.x + labelRecord.width / 2 + width / 2 > labelRecord.x + labelRecord.width - 2) {
      throw new Error(`Label ${labelRecord.value} exceeds its mask`);
    }
    for (const connector of activeLayout.connectors) {
      for (const segment of connector) {
        if (segmentHitsRect(...segment, labelRecord, 1)) throw new Error(`Label ${labelRecord.value} collides with a connector`);
      }
    }
  }

  for (const connector of activeLayout.connectors) {
    for (const segment of connector) {
      for (const nodeRecord of activeLayout.nodes) {
        if (segmentHitsNodeInterior(...segment, nodeRecord)) throw new Error(`Connector enters node ${nodeRecord.tag} interior`);
      }
    }
  }
}

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

function rect(x, y, width, height, options = {}) {
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
  if (activeLayout && marker) activeLayout.connectors.push([[x1, y1, x2, y2]]);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${marker ? ` marker-end="url(#${marker})"` : ""}/>`;
}

function pathSvg(d, options = {}) {
  const { stroke = C.muted, strokeWidth = 1.2, marker, dash } = options;
  if (activeLayout && marker) activeLayout.connectors.push(pathSegments(d));
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}${marker ? ` marker-end="url(#${marker})"` : ""}/>`;
}

function markerDefs(id) {
  return [
    `<marker id="${id}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${C.muted}"/></marker>`,
    `<marker id="${id}-arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${C.link}"/></marker>`,
    `<marker id="${id}-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${C.accent}"/></marker>`,
  ].join("");
}

function label(x, y, width, value, color = C.soft) {
  if (activeLayout) activeLayout.labels.push({ x, y, width, height: 12, value });
  return `${rect(x, y, width, 12, { fill: C.paper, rx: 2 })}${text(x + width / 2, y + 10, value, { fill: color, size: 8, family: F.mono, anchor: "middle", spacing: 0.04 })}`;
}

function sectionLabel(x, y, value, color = C.soft) {
  return text(x, y, value, { fill: color, size: 8, family: F.mono, weight: 500, spacing: 0.16 });
}

function node({
  x,
  y,
  width,
  height,
  tag,
  title,
  sub = "",
  titleLines,
  fill = C.white,
  stroke = C.ink,
  titleSize = 12,
  focal = false,
  dash,
}) {
  const actualFill = focal ? C.accentTint : fill;
  const actualStroke = focal ? C.accent : stroke;
  const lines = titleLines ?? [title];
  const subY = y + height - 12;
  const titleSpan = (lines.length - 1) * 16;
  const startY = Math.round((y + 28 + subY - titleSpan) / 2);
  const tagWidth = Math.max(40, Math.ceil((tag.length * 7 + 16) / 4) * 4);
  if (tagWidth + 24 > width) throw new Error(`Tag ${tag} does not fit inside ${width}px node`);
  if (activeLayout) activeLayout.nodes.push({ x, y, width, height, tag, tagWidth, titleLines: lines, titleSize, startY, sub: Boolean(sub), subY });
  let out = rect(x, y, width, height, { fill: C.paper, rx: 6 });
  out += rect(x, y, width, height, { fill: actualFill, stroke: actualStroke, strokeWidth: focal ? 1.2 : 1, rx: 6, dash });
  out += rect(x + 12, y + 12, tagWidth, 16, { fill: "none", stroke: actualStroke, strokeWidth: 0.8, rx: 2 });
  out += text(x + 12 + tagWidth / 2, y + 24, tag, { fill: actualStroke, size: 8, family: F.mono, weight: 500, anchor: "middle", spacing: 0.06 });
  lines.forEach((value, index) => {
    out += text(x + width / 2, startY + index * 16, value, { fill: C.ink, size: titleSize, family: F.sans, weight: 600, anchor: "middle" });
  });
  if (sub) out += text(x + width / 2, subY, sub, { fill: C.muted, size: 8, family: F.mono, anchor: "middle" });
  return out;
}

function legend(items) {
  let out = line(40, 540, 920, 540, { stroke: C.rule, strokeWidth: 0.8 });
  out += text(40, 568, "LEGEND", { fill: C.muted, size: 8, family: F.mono, weight: 500, spacing: 0.14 });
  items.forEach((item) => {
    out += rect(item.x, 556, 12, 12, { fill: item.fill ?? "none", stroke: item.stroke ?? item.fill ?? C.muted, strokeWidth: 0.8, rx: 2 });
    out += text(item.x + 20, 568, item.label, { fill: C.muted, size: 8, family: F.mono });
  });
  return out;
}

function frame({ id, title, description, eyebrow, subtitle, body, extra = "" }) {
  validateLayout(id);
  activeLayout = null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="100%" height="100%" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${esc(title)}</title>
<desc id="${id}-desc">${esc(description)}</desc>
<defs>${markerDefs(id)}</defs>
<rect width="960" height="600" fill="${C.paper}"/>
${text(40, 40, eyebrow, { fill: C.muted, size: 8, family: F.mono, weight: 500, spacing: 0.18 })}
${text(40, 76, title, { fill: C.ink, size: 28, family: F.serif })}
${text(40, 104, subtitle, { fill: C.muted, size: 12, family: F.sans })}
${body}
${extra}
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
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!match) throw new Error("No SVG found in generated HTML");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${match[0].replace("<defs>", `<defs>${svgFontImport}`)}\n`;
}

function idcPath() {
  const id = "speedtest-whitepaper-idc-path";
  startLayout(id);
  let body = sectionLabel(56, 152, "PLACEMENT · IDC / ISP / IXP");
  body += label(360, 152, 240, "DOWNLOAD · NODE → CLIENT", C.link);
  body += label(360, 344, 240, "UPLOAD · CLIENT → NODE", C.accent);

  const topY = 240;
  const bottomY = 288;
  body += line(728, topY, 672, topY, { stroke: C.link, marker: `${id}-arrow-link`, strokeWidth: 1.2 });
  body += line(488, topY, 448, topY, { stroke: C.link, marker: `${id}-arrow-link`, strokeWidth: 1.2 });
  body += line(264, topY, 232, topY, { stroke: C.link, marker: `${id}-arrow-link`, strokeWidth: 1.2 });
  body += line(232, bottomY, 264, bottomY, { stroke: C.accent, marker: `${id}-arrow-accent`, strokeWidth: 1.2 });
  body += line(448, bottomY, 488, bottomY, { stroke: C.accent, marker: `${id}-arrow-accent`, strokeWidth: 1.2 });
  body += line(672, bottomY, 728, bottomY, { stroke: C.accent, marker: `${id}-arrow-accent`, strokeWidth: 1.2 });

  body += node({ x: 56, y: 216, width: 176, height: 96, tag: "CLIENT", title: "终端", sub: "Wi-Fi · 5G · FTTH", fill: "rgba(79,93,117,0.10)", stroke: C.soft, titleSize: 16 });
  body += node({ x: 264, y: 216, width: 184, height: 96, tag: "ISP", title: "接入与骨干", sub: "last mile · transit", fill: C.white, stroke: C.ink, titleSize: 14 });
  body += node({ x: 488, y: 216, width: 184, height: 96, tag: "IDC", title: "机房网络", sub: "edge · cross-connect", fill: C.accentTint, stroke: C.accent, titleSize: 14, focal: true });
  body += node({ x: 728, y: 216, width: 176, height: 96, tag: "NODE", title: "测速主机", sub: "NIC · kernel · HTTP", fill: C.white, stroke: C.ink, titleSize: 14 });

  body += rect(56, 404, 848, 100, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += sectionLabel(72, 428, "WHAT IDC CHANGES", C.accent);
  body += line(272, 440, 272, 488, { stroke: C.rule, strokeWidth: 0.8 });
  body += line(480, 440, 480, 488, { stroke: C.rule, strokeWidth: 0.8 });
  body += line(688, 440, 688, 488, { stroke: C.rule, strokeWidth: 0.8 });
  body += text(72, 456, "RTT baseline", { fill: C.ink, size: 11, family: F.mono, weight: 600 });
  body += text(72, 478, "距离 + 排队", { fill: C.muted, size: 10, family: F.sans });
  body += text(288, 456, "interconnect", { fill: C.ink, size: 11, family: F.mono, weight: 600 });
  body += text(288, 478, "ISP / IXP / transit", { fill: C.muted, size: 10, family: F.sans });
  body += text(496, 456, "uplink + host", { fill: C.ink, size: 11, family: F.mono, weight: 600 });
  body += text(496, 478, "出口、队列、NIC", { fill: C.muted, size: 10, family: F.sans });
  body += text(704, 456, "accounting", { fill: C.ink, size: 11, family: F.mono, weight: 600 });
  body += text(704, 478, "端口 / 出口 / 重传", { fill: C.muted, size: 10, family: F.sans });
  body += text(56, 526, "IDC 是承载与互联环境；测速节点是其中的应用端点。CDN / PoP 可能改变端点位置和路由，不等同于专用测试节点。", { fill: C.muted, size: 10, family: F.sans });
  body += legend([
    { x: 136, label: "DOWNLOAD PATH", fill: C.link },
    { x: 360, label: "UPLOAD PATH", fill: C.accent },
    { x: 568, label: "IDC BOUNDARY", fill: C.accent },
  ]);
  return frame({ id, title: "测速节点不是孤立的服务器", description: "路径图区分终端、ISP 接入与骨干、IDC 机房网络和测速主机。下行与上行经过相同的逻辑阶段但方向相反；IDC 影响互联、往返时延基线、出口容量、排队与账单条件，但不等于 ISP 或测速节点本身。", eyebrow: "NETWORK PLACEMENT · IDC", subtitle: "一次测速同时经过接入网、网间互联、机房出口和应用端点", body });
}

function measurementModel() {
  const id = "speedtest-whitepaper-measurement-model";
  startLayout(id);
  let body = sectionLabel(56, 152, "MEASUREMENT MODEL");
  body += rect(280, 180, 400, 188, { fill: "rgba(45,49,66,0.02)", stroke: C.rule, strokeWidth: 0.8, rx: 8 });
  body += sectionLabel(304, 196, "SAME PHYSICAL PATH");
  body += rect(304, 220, 352, 40, { fill: C.linkTint, stroke: "rgba(46,90,168,0.24)", strokeWidth: 0.8, rx: 4 });
  body += rect(304, 288, 352, 40, { fill: C.accentTint, stroke: "rgba(235,108,54,0.24)", strokeWidth: 0.8, rx: 4 });
  body += line(728, 240, 232, 240, { stroke: C.link, marker: `${id}-arrow-link`, strokeWidth: 1.4 });
  body += line(232, 308, 728, 308, { stroke: C.accent, marker: `${id}-arrow-accent`, strokeWidth: 1.4 });
  body += label(384, 204, 192, "NODE → CLIENT · ΔB_rx", C.link);
  body += label(384, 272, 192, "CLIENT → NODE · ΔB_tx", C.accent);
  body += text(480, 342, "同一路径，两个观察点", { fill: C.muted, size: 9, family: F.sans, anchor: "middle" });
  body += node({ x: 56, y: 204, width: 176, height: 128, tag: "CLIENT", titleLines: ["客户端"], sub: "rx / tx measurement" , fill: "rgba(79,93,117,0.10)", stroke: C.soft, titleSize: 16 });
  body += node({ x: 728, y: 204, width: 176, height: 128, tag: "NODE", titleLines: ["测速节点"], sub: "/garbage · /empty", fill: C.white, stroke: C.ink, titleSize: 16 });
  body += rect(56, 412, 256, 72, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += rect(336, 412, 256, 72, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += rect(616, 412, 288, 72, { fill: C.accentTint, stroke: C.accent, strokeWidth: 1, rx: 6 });
  body += text(72, 436, "R_down", { fill: C.link, size: 16, family: F.mono, weight: 600 });
  body += text(72, 460, "= 8 · ΔB_rx / Δt", { fill: C.ink, size: 12, family: F.mono });
  body += text(352, 436, "R_up", { fill: C.accent, size: 16, family: F.mono, weight: 600 });
  body += text(352, 460, "= 8 · ΔB_tx / Δt", { fill: C.ink, size: 12, family: F.mono });
  body += text(632, 436, "R ≤ min(C_access, C_path, C_node, C_queue)", { fill: C.ink, size: 10, family: F.mono, weight: 600 });
  body += text(632, 460, "同一节点 ≠ 同一测量结果", { fill: C.muted, size: 12, family: F.sans });
  body += legend([
    { x: 136, label: "DOWNLOAD / RECEIVED", fill: C.link },
    { x: 392, label: "UPLOAD / EMITTED", fill: C.accent },
    { x: 640, label: "MEASUREMENT WINDOW", fill: C.ink },
  ]);
  return frame({ id, title: "测速值是路径窗口里的字节", description: "上下行数据流展示不同方向的测量点：下行在客户端统计收到的字节，上行在客户端统计已经交给网络栈的字节，最终结果受访问链路、路径、节点和队列共同约束。", eyebrow: "MODEL · GOODPUT", subtitle: "先定义计量点，再讨论带宽、延迟和实现细节", body });
}

function bdpWindow() {
  const id = "speedtest-whitepaper-bdp-window";
  startLayout(id);
  let body = text(56, 154, "BDP = bandwidth × RTT", { fill: C.accent, size: 20, family: F.mono, weight: 600 });
  body += text(56, 180, "在途窗口小于 BDP 时，发送方会等待确认；并发只能扩大在途预算，不能越过瓶颈。", { fill: C.muted, size: 12, family: F.sans });
  body += rect(56, 204, 848, 112, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += rect(56, 340, 848, 132, { fill: "rgba(45,49,66,0.02)", stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += sectionLabel(72, 228, "ONE FLOW");
  body += sectionLabel(72, 364, "N FLOWS");
  body += label(248, 208, 160, "cwnd < BDP → waits", C.muted);
  body += line(216, 268, 304, 268, { stroke: C.muted, marker: `${id}-arrow` });
  body += line(464, 268, 520, 268, { stroke: C.muted, marker: `${id}-arrow` });
  body += line(664, 268, 744, 268, { stroke: C.muted, marker: `${id}-arrow` });
  body += node({ x: 88, y: 236, width: 128, height: 64, tag: "SEND", title: "sender", sub: "cwnd", titleSize: 12 });
  body += node({ x: 304, y: 236, width: 160, height: 64, tag: "WINDOW", title: "单个 cwnd", sub: "in-flight bytes", fill: C.linkTint, stroke: C.link, titleSize: 12 });
  body += node({ x: 520, y: 236, width: 144, height: 64, tag: "C_PATH", title: "共享瓶颈", sub: "path capacity", fill: C.accentTint, stroke: C.accent, titleSize: 12, focal: true });
  body += node({ x: 744, y: 236, width: 128, height: 64, tag: "RECV", title: "receiver", sub: "ACK", titleSize: 12 });
  body += text(304, 314, "窗口不足时，发送方会在 ACK 到来前出现空档。", { fill: C.muted, size: 9, family: F.sans });

  body += line(216, 420, 288, 420, { stroke: C.link, marker: `${id}-arrow-link` });
  body += line(496, 420, 544, 420, { stroke: C.link, marker: `${id}-arrow-link` });
  body += line(688, 420, 744, 420, { stroke: C.link, marker: `${id}-arrow-link` });
  body += node({ x: 88, y: 388, width: 128, height: 64, tag: "SEND", title: "sender", sub: "N streams", titleSize: 12 });
  body += rect(288, 372, 208, 96, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += sectionLabel(304, 392, "N IN-FLIGHT WINDOWS", C.link);
  body += rect(304, 404, 72, 12, { fill: C.linkTint, stroke: C.link, strokeWidth: 0.8, rx: 2 });
  body += rect(304, 420, 72, 12, { fill: C.linkTint, stroke: C.link, strokeWidth: 0.8, rx: 2 });
  body += rect(304, 436, 72, 12, { fill: C.linkTint, stroke: C.link, strokeWidth: 0.8, rx: 2 });
  body += text(340, 413, "flow 1", { fill: C.link, size: 8, family: F.mono, anchor: "middle" });
  body += text(340, 429, "flow 2", { fill: C.link, size: 8, family: F.mono, anchor: "middle" });
  body += text(340, 445, "flow N", { fill: C.link, size: 8, family: F.mono, anchor: "middle" });
  body += text(392, 420, "aggregate", { fill: C.ink, size: 10, family: F.mono, weight: 600 });
  body += text(392, 440, "in-flight", { fill: C.muted, size: 9, family: F.mono });
  body += node({ x: 544, y: 388, width: 144, height: 64, tag: "C_PATH", title: "共享瓶颈", sub: "path capacity", fill: C.accentTint, stroke: C.accent, titleSize: 12, focal: true });
  body += node({ x: 744, y: 388, width: 128, height: 64, tag: "RECV", title: "receiver", sub: "ACK", titleSize: 12 });
  body += text(304, 464, "N 个窗口增加预算，但仍共享同一个 C_path。", { fill: C.muted, size: 9, family: F.sans });
  body += rect(56, 496, 848, 28, { fill: C.paper2, stroke: "none", rx: 4 });
  body += text(72, 515, "示例（仅说明量纲）：1 Gbit/s × 40 ms ≈ 5 MB BDP；这是窗口预算，不是实测吞吐。", { fill: C.muted, size: 10, family: F.sans });
  body += legend([
    { x: 136, label: "IN-FLIGHT DATA", fill: C.link },
    { x: 360, label: "BOTTLENECK", fill: C.accent },
    { x: 552, label: "ACK / WAIT", fill: C.muted },
  ]);
  return frame({ id, title: "单流的上限来自在途窗口", description: "BDP 图把单流表示为一个 cwnd，把多流表示为 N 个独立的在途窗口；两者都经过明确标注的 C_path 共享瓶颈。示例数字只用于说明量纲。", eyebrow: "PHYSICAL LIMIT · BDP", subtitle: "单流只有一个窗口；多流增加预算，但仍共享同一个路径瓶颈", body });
}

function backpressure() {
  const id = "speedtest-whitepaper-backpressure";
  startLayout(id);
  let body = sectionLabel(56, 156, "UPLOAD · TCP RECEIVE WINDOW");
  body += rect(256, 188, 648, 120, { fill: "rgba(46,90,168,0.03)", stroke: "rgba(46,90,168,0.20)", strokeWidth: 0.8, rx: 6 });
  body += rect(256, 364, 648, 120, { fill: "rgba(235,108,54,0.03)", stroke: "rgba(235,108,54,0.28)", strokeWidth: 0.8, rx: 6 });
  body += sectionLabel(280, 212, "READ PROMPTLY", C.link);
  body += sectionLabel(280, 388, "READ SLOWLY", C.accent);
  body += line(200, 312, 256, 312, { stroke: C.muted, marker: `${id}-arrow` });
  body += pathSvg("M400,296 H424 Q432,296 432,288 V244 Q432,236 440,236 H456", { stroke: C.link, marker: `${id}-arrow-link` });
  body += pathSvg("M400,328 H424 Q432,328 432,408 Q432,416 440,416 H456", { stroke: C.accent, marker: `${id}-arrow-accent` });
  body += line(632, 236, 696, 236, { stroke: C.link, marker: `${id}-arrow-link` });
  body += line(632, 416, 696, 416, { stroke: C.accent, marker: `${id}-arrow-accent` });
  body += node({ x: 56, y: 272, width: 144, height: 80, tag: "CLIENT", title: "POST body", sub: "bytes emitted", fill: C.linkTint, stroke: C.link, titleSize: 16 });
  body += node({ x: 256, y: 272, width: 144, height: 80, tag: "KERNEL", title: "TCP Recv-Q", sub: "server socket", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 456, y: 204, width: 176, height: 64, tag: "APP", title: "io.Copy(Discard)", sub: "read promptly", fill: C.linkTint, stroke: C.link, titleSize: 12 });
  body += node({ x: 696, y: 204, width: 176, height: 64, tag: "TCP", title: "window open", sub: "sender continues", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 456, y: 384, width: 176, height: 64, tag: "APP", title: "slow consumer", sub: "read gap grows", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 696, y: 384, width: 176, height: 64, tag: "TCP", title: "window → 0", sub: "sender stalls", fill: C.accentTint, stroke: C.accent, titleSize: 12, focal: true });
  body += label(204, 284, 48, "body", C.muted);
  body += label(404, 228, 64, "prompt", C.link);
  body += label(404, 408, 48, "gap", C.accent);
  body += rect(56, 456, 144, 52, { fill: C.paper2, stroke: C.rule, strokeWidth: 0.8, rx: 4 });
  body += text(128, 478, "服务端不计速率", { fill: C.ink, size: 10, family: F.sans, weight: 600, anchor: "middle" });
  body += text(128, 494, "只负责及时读完", { fill: C.muted, size: 9, family: F.sans, anchor: "middle" });
  body += legend([
    { x: 136, label: "READ PROMPTLY", fill: C.link },
    { x: 360, label: "BACKPRESSURE", fill: C.accent },
    { x: 600, label: "WINDOW STATE", fill: C.muted },
  ]);
  return frame({ id, title: "TCP 反压不是抽象概念", description: "上行路径对比及时读取和慢消费：及时读取使 TCP 接收窗口保持开放，慢消费填满 Recv-Q 后会缩小通告窗口，最终让客户端发送方停顿。", eyebrow: "DATA PATH · BACKPRESSURE", subtitle: "服务端 sink 的价值不是“快”这个形容词，而是避免把接收窗口关掉", body });
}

function timeSampling() {
  const id = "speedtest-whitepaper-time-sampling";
  startLayout(id);
  let body = sectionLabel(56, 152, "CLOCKS · WINDOWS · SAMPLES");
  body += text(72, 190, "wall clock", { fill: C.soft, size: 10, family: F.mono });
  body += pathSvg("M176,184 H320 V168 H448 V192 H584 V176 H720 V184 H864", { stroke: C.soft, strokeWidth: 1.2, dash: "4,4" });
  body += text(72, 232, "elapsed clock", { fill: C.link, size: 10, family: F.mono });
  body += line(176, 224, 864, 224, { stroke: C.link, strokeWidth: 1.2 });
  for (const x of [272, 368, 464, 560, 656, 752, 848]) body += line(x, 216, x, 232, { stroke: C.link, strokeWidth: 0.8 });
  body += label(376, 156, 160, "Date.now() can step", C.soft);
  body += label(376, 236, 160, "use elapsed duration", C.link);
  body += rect(56, 276, 848, 112, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += sectionLabel(72, 300, "TEST WINDOW");
  body += rect(176, 320, 184, 32, { fill: C.paper2, stroke: C.rule, strokeWidth: 0.8, rx: 4 });
  body += rect(360, 320, 392, 32, { fill: C.linkTint, stroke: C.link, strokeWidth: 0.8, rx: 4 });
  body += rect(752, 320, 112, 32, { fill: C.accentTint, stroke: C.accent, strokeWidth: 0.8, rx: 4 });
  body += text(268, 341, "grace / warm-up", { fill: C.muted, size: 10, family: F.sans, weight: 600, anchor: "middle" });
  body += text(556, 341, "measurement · totLoaded / elapsed", { fill: C.link, size: 10, family: F.sans, weight: 600, anchor: "middle" });
  body += text(808, 341, "stop / abort", { fill: C.accent, size: 10, family: F.sans, weight: 600, anchor: "middle" });
  body += text(176, 372, "down 1.5s · up 3s", { fill: C.soft, size: 9, family: F.mono });
  body += text(552, 372, "Worker tick = 200ms", { fill: C.muted, size: 9, family: F.mono, anchor: "middle" });
  body += text(864, 372, "time_auto", { fill: C.soft, size: 9, family: F.mono, anchor: "end" });
  body += rect(56, 416, 408, 72, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += rect(496, 416, 408, 72, { fill: C.accentTint, stroke: C.accent, strokeWidth: 0.8, rx: 6 });
  body += text(72, 440, "speed = totLoaded / (t / 1000)", { fill: C.ink, size: 12, family: F.mono, weight: 600 });
  body += text(72, 464, "Mbps = speed × 8 × factor ÷ unit", { fill: C.muted, size: 10, family: F.mono });
  body += text(512, 440, "P90 / median / mean", { fill: C.accent, size: 12, family: F.mono, weight: 600 });
  body += text(512, 464, "统计量由问题决定；不是当前 Worker 的隐藏实现", { fill: C.ink, size: 10, family: F.sans });
  body += legend([
    { x: 136, label: "WALL CLOCK RISK", fill: C.soft },
    { x: 368, label: "ELAPSED WINDOW", fill: C.link },
    { x: 584, label: "BOUNDARY / CHOICE", fill: C.accent },
  ]);
  return frame({ id, title: "时间窗口先固定，统计量才有意义", description: "时间图对比会跳变的墙上时钟与用于持续时间计算的平滑 elapsed clock，并展示测速的 grace、measurement、stop 窗口、200ms 更新和公式边界。", eyebrow: "MEASUREMENT · TIME", subtitle: "慢启动、时钟语义和统计选择是三个不同的问题，不能混成一个 P90 口号", body });
}

function sourceMap() {
  const id = "speedtest-whitepaper-librespeed-map";
  startLayout(id);
  let body = sectionLabel(56, 152, "SOURCE MAP · 59CFF12");
  body += rect(56, 180, 848, 132, { fill: "rgba(46,90,168,0.03)", stroke: "rgba(46,90,168,0.20)", strokeWidth: 0.8, rx: 8 });
  body += sectionLabel(72, 204, "RUNTIME REQUEST PATH", C.link);
  body += rect(56, 344, 848, 132, { fill: "rgba(45,49,66,0.02)", stroke: C.rule, strokeWidth: 0.8, rx: 8 });
  body += sectionLabel(72, 368, "BOOT ORDER", C.muted);
  body += line(216, 244, 296, 244, { stroke: C.link, marker: `${id}-arrow-link` });
  body += line(472, 244, 552, 244, { stroke: C.link, marker: `${id}-arrow-link` });
  body += line(728, 244, 808, 244, { stroke: C.link, marker: `${id}-arrow-link` });
  body += node({ x: 72, y: 208, width: 144, height: 72, tag: "BROWSER", title: "Worker", sub: "test_order", fill: C.linkTint, stroke: C.link, titleSize: 12 });
  body += node({ x: 296, y: 208, width: 176, height: 72, tag: "WEB", title: "chi routes", sub: "garbage · empty · getIP", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 552, y: 208, width: 176, height: 72, tag: "RESULTS", title: "Record / read", sub: "telemetry · JSON · PNG", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 808, y: 208, width: 80, height: 72, tag: "DB", title: "DB", sub: "Insert", fill: C.accentTint, stroke: C.accent, titleSize: 12, focal: true });
  body += line(200, 412, 240, 412, { stroke: C.muted, marker: `${id}-arrow` });
  body += line(400, 412, 440, 412, { stroke: C.muted, marker: `${id}-arrow` });
  body += line(600, 412, 640, 412, { stroke: C.muted, marker: `${id}-arrow` });
  body += line(800, 412, 840, 412, { stroke: C.muted, marker: `${id}-arrow` });
  body += node({ x: 72, y: 376, width: 128, height: 72, tag: "01", title: "config.Load", sub: "viper", titleSize: 12 });
  body += node({ x: 240, y: 376, width: 160, height: 72, tag: "02", title: "SetServerLocation", sub: "coordinates", titleSize: 12 });
  body += node({ x: 440, y: 376, width: 160, height: 72, tag: "03", title: "results.Initialize", sub: "font faces", titleSize: 12 });
  body += node({ x: 640, y: 376, width: 160, height: 72, tag: "04", title: "database.SetDBInfo", sub: "DataAccess", titleSize: 12 });
  body += node({ x: 840, y: 376, width: 64, height: 72, tag: "05", title: "web", sub: "listen", titleSize: 10 });
  body += text(72, 500, "main.go 只装配依赖；真正的测速循环在浏览器 Worker，Go 服务端提供 HTTP 边界。", { fill: C.muted, size: 12, family: F.sans });
  body += legend([
    { x: 136, label: "CLIENT → SERVER", fill: C.link },
    { x: 376, label: "BOOT DEPENDENCY", fill: C.muted },
    { x: 600, label: "PERSISTENCE EDGE", fill: C.accent },
  ]);
  return frame({ id, title: "把测速原则映射回 speedtest-go", description: "源码映射图把浏览器 Worker、chi 路由、结果处理和 DataAccess 连接起来，并在下方列出 main.go 的实际启动顺序。内容对应 speedtest-go commit 59cff12。", eyebrow: "IMPLEMENTATION · SOURCE MAP", subtitle: "同一张图同时标出请求路径和启动依赖，避免把客户端算法归给 Go 服务端", body });
}

function workerSequence() {
  const id = "speedtest-whitepaper-worker-sequence";
  startLayout(id);
  let body = sectionLabel(56, 120, "SEQUENCE · DEFAULT IP_D_U");
  const centers = [160, 480, 800];
  for (const center of centers) body += line(center, 196, center, 532, { stroke: "rgba(45,49,66,0.20)", strokeWidth: 0.8, dash: "3,3" });

  // The optional zone is painted first so its border never hides an activation bar.
  body += rect(520, 400, 352, 48, { fill: "rgba(45,49,66,0.02)", stroke: "rgba(45,49,66,0.22)", strokeWidth: 0.8, rx: 4 });
  body += rect(520, 400, 72, 16, { fill: C.paper, stroke: "rgba(45,49,66,0.22)", strokeWidth: 0.8, rx: 2 });
  body += text(556, 412, "OPTIONAL", { fill: C.muted, size: 8, family: F.mono, anchor: "middle", spacing: 0.08 });
  body += text(608, 436, "[P in test_order]", { fill: C.muted, size: 8, family: F.mono });

  const activation = {
    ui: { left: 156, right: 164, start: 220, end: 500 },
    worker: { left: 476, right: 484, start: 220, end: 500 },
    server: { left: 796, right: 804 },
  };
  body += rect(activation.ui.left, activation.ui.start, 8, activation.ui.end - activation.ui.start, { fill: "rgba(45,49,66,0.06)", stroke: C.muted, strokeWidth: 0.8 });
  body += rect(activation.worker.left, activation.worker.start, 8, activation.worker.end - activation.worker.start, { fill: C.accentTint, stroke: C.accent, strokeWidth: 0.8 });
  const serverIntervals = [[284, 304], [328, 348], [372, 392], [416, 432], [456, 476]];
  for (const [y, h] of serverIntervals.map(([start, end]) => [start, end - start])) body += rect(activation.server.left, y, 8, h, { fill: "rgba(45,49,66,0.06)", stroke: C.muted, strokeWidth: 0.8 });
  const messages = [
    [activation.ui.right, activation.ui.start, activation.worker.left, activation.worker.start, C.link, `${id}-arrow-link`, "start + settings", 260, 200, 96],
    [activation.ui.right, 244, activation.worker.left, 244, C.link, `${id}-arrow-link`, "status · 200ms", 236, 224, 112],
    [activation.worker.left, 260, activation.ui.right, 260, C.muted, `${id}-arrow`, "status JSON → onupdate", 208, 268, 160],
    [activation.worker.right, 284, activation.server.left, 284, C.link, `${id}-arrow-link`, "GET /getIP", 616, 264, 80],
    [activation.server.left, 304, activation.worker.right, 304, C.muted, `${id}-arrow`, "JSON", 620, 288, 48],
    [activation.worker.right, 328, activation.server.left, 328, C.link, `${id}-arrow-link`, "GET /garbage ×6", 604, 308, 112],
    [activation.server.left, 348, activation.worker.right, 348, C.muted, `${id}-arrow`, "random bytes", 604, 332, 112],
    [activation.worker.right, 372, activation.server.left, 372, C.link, `${id}-arrow-link`, "POST /empty ×3", 604, 352, 112],
    [activation.server.left, 392, activation.worker.right, 392, C.muted, `${id}-arrow`, "200", 620, 376, 48],
    [activation.worker.right, 416, activation.server.left, 416, C.link, `${id}-arrow-link`, "P? GET /empty ×10", 588, 396, 144],
    [activation.server.left, 432, activation.worker.right, 432, C.muted, `${id}-arrow`, "P samples ×10", 500, 436, 96],
    [activation.worker.right, 456, activation.server.left, 456, C.link, `${id}-arrow-link`, "POST telemetry", 604, 436, 112],
    [activation.server.left, 476, activation.worker.right, 476, C.accent, `${id}-arrow-accent`, "id <ULID>", 604, 480, 112, "5,4"],
    [activation.worker.left, activation.worker.end, activation.ui.right, activation.ui.end, C.accent, `${id}-arrow-accent`, "onend / done", 248, 504, 112, "5,4"],
  ];
  if (messages.some(([x1, , x2]) => centers.includes(x1) || centers.includes(x2))) {
    throw new Error("Sequence message endpoints must attach to activation-bar edges, not lifeline centres");
  }
  const serverMessageYs = new Set(serverIntervals.flat());
  if (messages.some(([x1, y1, x2]) =>
    (x1 === activation.server.left || x2 === activation.server.left) && !serverMessageYs.has(y1))) {
    throw new Error("Every server message must align with an activation-bar edge");
  }
  if (messages[0][1] !== activation.ui.start || messages[0][1] !== activation.worker.start || messages.at(-1)[1] !== activation.worker.end) {
    throw new Error("Participant activation bars must align with the first call and final return");
  }
  const hasMessage = (from, to, y) => messages.some(([x1, y1, x2, y2]) => x1 === from && y1 === y && x2 === to && y2 === y);
  for (const [start, end] of serverIntervals) {
    if (!hasMessage(activation.worker.right, activation.server.left, start) || !hasMessage(activation.server.left, activation.worker.right, end)) {
      throw new Error(`Server activation ${start}-${end} must start at request and end at response`);
    }
  }
  for (const [x1, y1, x2, y2, stroke, marker, , , , , dash] of messages) body += line(x1, y1, x2, y2, { stroke, marker, strokeWidth: stroke === C.muted ? 1 : 1.2, dash: dash || (stroke === C.muted ? "5,4" : undefined) });
  for (const [, , , , , , value, x, y, width] of messages) body += label(x, y, width, value, value === "id <ULID>" ? C.accent : C.muted);
  body += node({ x: 80, y: 136, width: 160, height: 64, tag: "UI", title: "Main thread", sub: "postMessage", fill: "rgba(79,93,117,0.10)", stroke: C.soft, titleSize: 12 });
  body += node({ x: 400, y: 136, width: 160, height: 64, tag: "WORKER", title: "Web Worker", sub: "runNextTest", fill: C.accentTint, stroke: C.accent, titleSize: 12, focal: true });
  body += node({ x: 720, y: 136, width: 160, height: 64, tag: "GO", title: "Go server", sub: "HTTP handlers", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += text(56, 566, "激活条上边界对齐请求箭头，下边界对齐返回箭头；虚线生命线只表示时间。P 只有显式写进 test_order 才发生。", { fill: C.muted, size: 10, family: F.sans });
  return frame({ id, title: "Worker 合同：顺序由字符串驱动", description: "真实 Worker 时序展示 Main thread 创建 Worker、发送 start 和每 200ms 的 status，Worker 按默认 IP_D_U 调用 getIP、garbage、empty 和 telemetry；P 阶段只在 test_order 显式包含时出现。每个服务端激活条的上边界对齐请求箭头，下边界对齐返回箭头。", eyebrow: "PROTOCOL · WORKER", subtitle: "Main thread 负责控制与渲染，Worker 才持有测速数据流", body });
}

function evidenceBoundary() {
  const id = "speedtest-whitepaper-evidence-boundary";
  startLayout(id);
  let body = sectionLabel(56, 152, "EVIDENCE BOUNDARY · 2026-08-26");
  body += rect(56, 180, 240, 236, { fill: C.linkTint, stroke: "rgba(46,90,168,0.28)", strokeWidth: 0.8, rx: 8 });
  body += rect(360, 180, 240, 236, { fill: "rgba(45,49,66,0.02)", stroke: C.rule, strokeWidth: 0.8, rx: 8 });
  body += rect(664, 180, 240, 236, { fill: C.accentTint, stroke: "rgba(235,108,54,0.36)", strokeWidth: 0.8, rx: 8, dash: "5,4" });
  body += sectionLabel(72, 204, "SOURCE FACTS", C.link);
  body += sectionLabel(376, 204, "LOCAL OBSERVATION", C.muted);
  body += sectionLabel(680, 204, "NOT ESTABLISHED", C.accent);
  body += node({ x: 80, y: 232, width: 192, height: 72, tag: "SOURCE", title: "speedtest-go", sub: "@ 59cff12", fill: C.white, stroke: C.link, titleSize: 16 });
  body += node({ x: 80, y: 328, width: 192, height: 64, tag: "CODE", title: "routes · Worker · DB", sub: "read from checkout", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 384, y: 232, width: 192, height: 72, tag: "RUN", title: "本机 loopback", sub: "memory backend", fill: C.white, stroke: C.ink, titleSize: 16 });
  body += node({ x: 384, y: 328, width: 192, height: 64, tag: "LOG", title: "bytes · status · ID", sub: "evidence_run.log", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 688, y: 232, width: 192, height: 80, tag: "OUT", titleLines: ["公网容量", "Linux / TLS"], sub: "not run here", fill: C.accentTint, stroke: C.accent, titleSize: 12, focal: true });
  body += node({ x: 688, y: 328, width: 192, height: 64, tag: "OUT", title: "10Gbps · p99 · HA", sub: "no evidence", fill: C.accentTint, stroke: C.accent, titleSize: 12 });
  body += line(272, 268, 384, 268, { stroke: C.link, marker: `${id}-arrow-link`, strokeWidth: 1.4 });
  body += line(576, 268, 688, 268, { stroke: C.accent, marker: `${id}-arrow-accent`, strokeWidth: 1.2, dash: "5,4" });
  body += label(296, 242, 72, "run", C.link);
  body += label(604, 242, 64, "boundary", C.accent);
  body += rect(56, 448, 848, 44, { fill: C.paper2, stroke: "none", rx: 4 });
  body += text(72, 476, "同一份源码可以支持更多部署入口，但“源码存在”与“该环境已验证”是两种不同证据。", { fill: C.ink, size: 12, family: F.sans, weight: 600 });
  body += legend([
    { x: 136, label: "SOURCE-SUPPORTED", fill: C.link },
    { x: 376, label: "LOCAL EVIDENCE", fill: C.muted },
    { x: 600, label: "UNVERIFIED CLAIM", fill: C.accent },
  ]);
  return frame({ id, title: "源码事实、运行观察和生产证明要分开", description: "证据边界图把 speedtest-go 的源码事实、本机 loopback 运行观察，以及尚未验证的公网容量、Linux、TLS 和高可用部署分开。", eyebrow: "EVIDENCE · SCOPE", subtitle: "一张图提醒读者：可读到的实现，不自动升级成可运营的结果", body });
}

const diagrams = [
  ["speedtest-whitepaper-idc-path", idcPath()],
  ["speedtest-whitepaper-measurement-model", measurementModel()],
  ["speedtest-whitepaper-bdp-window", bdpWindow()],
  ["speedtest-whitepaper-backpressure", backpressure()],
  ["speedtest-whitepaper-time-sampling", timeSampling()],
  ["speedtest-whitepaper-librespeed-map", sourceMap()],
  ["speedtest-whitepaper-worker-sequence", workerSequence()],
  ["speedtest-whitepaper-evidence-boundary", evidenceBoundary()],
];

await mkdir(evidenceDir, { recursive: true });
await mkdir(imageDir, { recursive: true });
for (const [name, svg] of diagrams) {
  const htmlPath = path.join(evidenceDir, `${name}.html`);
  const svgPath = path.join(imageDir, `${name}.svg`);
  await writeFile(htmlPath, htmlPage(name, svg), "utf8");
  const html = await import("node:fs/promises").then(({ readFile }) => readFile(htmlPath, "utf8"));
  await writeFile(svgPath, exportSvg(html), "utf8");
  console.log(`${name}.html -> public/images/${name}.svg`);
}
