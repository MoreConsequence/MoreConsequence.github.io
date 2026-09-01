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
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${marker ? ` marker-end="url(#${marker})"` : ""}/>`;
}

function pathSvg(d, options = {}) {
  const { stroke = C.muted, strokeWidth = 1.2, marker, dash } = options;
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
  const startY = y + (lines.length > 1 ? 36 : height <= 48 ? 28 : height <= 56 ? 34 : height <= 64 ? 40 : 42);
  const tagWidth = Math.max(40, Math.ceil((tag.length * 7 + 16) / 4) * 4);
  if (tagWidth + 24 > width) throw new Error(`Tag ${tag} does not fit inside ${width}px node`);
  let out = rect(x, y, width, height, { fill: C.paper, rx: 6 });
  out += rect(x, y, width, height, { fill: actualFill, stroke: actualStroke, strokeWidth: focal ? 1.2 : 1, rx: 6, dash });
  out += rect(x + 12, y + 12, tagWidth, 16, { fill: "none", stroke: actualStroke, strokeWidth: 0.8, rx: 2 });
  out += text(x + 12 + tagWidth / 2, y + 24, tag, { fill: actualStroke, size: 8, family: F.mono, weight: 500, anchor: "middle", spacing: 0.06 });
  lines.forEach((value, index) => {
    out += text(x + width / 2, startY + index * 16, value, { fill: C.ink, size: titleSize, family: F.sans, weight: 600, anchor: "middle" });
  });
  if (sub) out += text(x + width / 2, y + height - 12, sub, { fill: C.muted, size: 8, family: F.mono, anchor: "middle" });
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

function measurementModel() {
  const id = "speedtest-whitepaper-measurement-model";
  let body = sectionLabel(56, 152, "MEASUREMENT MODEL");
  body += rect(280, 180, 400, 188, { fill: "rgba(45,49,66,0.02)", stroke: C.rule, strokeWidth: 0.8, rx: 8 });
  body += sectionLabel(304, 196, "SAME PHYSICAL PATH");
  body += rect(304, 220, 352, 40, { fill: C.linkTint, stroke: "rgba(46,90,168,0.24)", strokeWidth: 0.8, rx: 4 });
  body += rect(304, 288, 352, 40, { fill: C.accentTint, stroke: "rgba(235,108,54,0.24)", strokeWidth: 0.8, rx: 4 });
  body += line(728, 240, 232, 240, { stroke: C.link, marker: `${id}-arrow-link`, strokeWidth: 1.4 });
  body += line(232, 308, 728, 308, { stroke: C.accent, marker: `${id}-arrow-accent`, strokeWidth: 1.4 });
  body += line(248, 220, 248, 260, { stroke: C.link, strokeWidth: 1.2 });
  body += line(248, 288, 248, 328, { stroke: C.accent, strokeWidth: 1.2 });
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
  let body = text(56, 154, "BDP = bandwidth × RTT", { fill: C.accent, size: 20, family: F.mono, weight: 600 });
  body += text(56, 180, "在途窗口小于 BDP 时，发送方会等待确认；并发只能扩大在途预算，不能越过瓶颈。", { fill: C.muted, size: 12, family: F.sans });
  body += rect(56, 204, 848, 112, { fill: C.white, stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += rect(56, 340, 848, 132, { fill: "rgba(45,49,66,0.02)", stroke: C.rule, strokeWidth: 0.8, rx: 6 });
  body += sectionLabel(72, 228, "ONE FLOW");
  body += sectionLabel(72, 364, "N FLOWS");
  body += line(216, 272, 744, 272, { stroke: C.muted, marker: `${id}-arrow` });
  body += line(216, 392, 744, 392, { stroke: C.link, strokeWidth: 1 });
  body += line(216, 404, 744, 404, { stroke: C.link, marker: `${id}-arrow-link`, strokeWidth: 1.2 });
  body += line(216, 416, 744, 416, { stroke: C.link, strokeWidth: 1 });
  body += rect(304, 248, 160, 16, { fill: C.linkTint, stroke: C.link, strokeWidth: 0.8, rx: 2 });
  body += text(384, 260, "one in-flight window", { fill: C.link, size: 8, family: F.mono, anchor: "middle" });
  body += rect(304, 348, 112, 12, { fill: C.linkTint, stroke: C.link, strokeWidth: 0.8, rx: 2 });
  body += rect(432, 348, 112, 12, { fill: C.linkTint, stroke: C.link, strokeWidth: 0.8, rx: 2 });
  body += rect(560, 348, 112, 12, { fill: C.linkTint, stroke: C.link, strokeWidth: 0.8, rx: 2 });
  body += text(360, 357, "window 1", { fill: C.link, size: 8, family: F.mono, anchor: "middle" });
  body += text(488, 357, "window 2", { fill: C.link, size: 8, family: F.mono, anchor: "middle" });
  body += text(616, 357, "window N", { fill: C.link, size: 8, family: F.mono, anchor: "middle" });
  body += rect(520, 244, 8, 56, { fill: C.accentTint, stroke: C.accent, strokeWidth: 1 });
  body += rect(520, 376, 8, 56, { fill: C.accentTint, stroke: C.accent, strokeWidth: 1 });
  body += text(540, 260, "C_path", { fill: C.accent, size: 9, family: F.mono, weight: 600 });
  body += text(540, 396, "瓶颈", { fill: C.accent, size: 9, family: F.mono, weight: 600 });
  body += text(540, 414, "总速率仍受 C_path", { fill: C.muted, size: 9, family: F.sans });
  body += node({ x: 88, y: 240, width: 128, height: 64, tag: "SEND", title: "sender", sub: "cwnd", titleSize: 12 });
  body += node({ x: 744, y: 240, width: 128, height: 64, tag: "RECV", title: "receiver", sub: "ACK", titleSize: 12 });
  body += node({ x: 88, y: 372, width: 128, height: 64, tag: "SEND", title: "sender", sub: "N streams", titleSize: 12 });
  body += node({ x: 744, y: 372, width: 128, height: 64, tag: "RECV", title: "receiver", sub: "ACK", titleSize: 12 });
  body += label(288, 292, 192, "cwnd < BDP → sender waits", C.muted);
  body += label(288, 432, 224, "N × cwnd → more in-flight data", C.link);
  body += rect(56, 496, 848, 28, { fill: C.paper2, stroke: "none", rx: 4 });
  body += text(72, 515, "示例（仅说明量纲）：1 Gbit/s × 40 ms ≈ 5 MB BDP；这是窗口预算，不是实测吞吐。", { fill: C.muted, size: 10, family: F.sans });
  body += legend([
    { x: 136, label: "IN-FLIGHT DATA", fill: C.link },
    { x: 360, label: "BOTTLENECK", fill: C.accent },
    { x: 552, label: "ACK / WAIT", fill: C.muted },
  ]);
  return frame({ id, title: "单流的上限来自在途窗口", description: "BDP 图对比单流和多流：单流窗口不足时发送方等待确认，多流可以增加在途字节预算，但总吞吐仍被路径瓶颈限制。示例数字只用于说明量纲。", eyebrow: "PHYSICAL LIMIT · BDP", subtitle: "多流不是凭空创造带宽，而是在同一条路径上增加在途预算", body });
}

function backpressure() {
  const id = "speedtest-whitepaper-backpressure";
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
  let body = sectionLabel(56, 120, "SEQUENCE · DEFAULT IP_D_U");
  const centers = [160, 480, 800];
  for (const center of centers) body += line(center, 196, center, 532, { stroke: "rgba(45,49,66,0.20)", strokeWidth: 1, dash: "3,3" });
  body += rect(156, 212, 8, 320, { fill: "rgba(45,49,66,0.06)", stroke: C.muted, strokeWidth: 0.8 });
  body += rect(476, 204, 8, 328, { fill: C.accentTint, stroke: C.accent, strokeWidth: 0.8 });
  const serverIntervals = [[240, 296], [304, 360], [364, 420], [436, 468], [480, 536]];
  for (const [y, h] of serverIntervals.map(([start, end]) => [start, end - start])) body += rect(796, y, 8, h, { fill: "rgba(45,49,66,0.06)", stroke: C.muted, strokeWidth: 0.8 });
  const messages = [
    [164, 220, 476, 220, C.link, `${id}-arrow-link`, "start + settings", 260, 200, 96],
    [484, 252, 796, 252, C.link, `${id}-arrow-link`, "GET /getIP", 616, 232, 80],
    [796, 280, 484, 280, C.muted, `${id}-arrow`, "JSON", 620, 260, 48],
    [484, 312, 796, 312, C.link, `${id}-arrow-link`, "GET /garbage ×6", 604, 292, 112],
    [796, 340, 484, 340, C.muted, `${id}-arrow`, "random bytes", 604, 320, 112],
    [484, 372, 796, 372, C.link, `${id}-arrow-link`, "POST /empty ×3", 604, 352, 112],
    [796, 400, 484, 400, C.muted, `${id}-arrow`, "200", 620, 380, 48],
    [484, 448, 796, 448, C.link, `${id}-arrow-link`, "P? GET /empty ×10", 588, 428, 144],
    [484, 492, 796, 492, C.link, `${id}-arrow-link`, "POST telemetry", 604, 472, 112],
    [796, 520, 484, 520, C.accent, `${id}-arrow-accent`, "id <ULID>", 604, 500, 112, "5,4"],
  ];
  if (messages.some(([x1, , x2]) => centers.includes(x1) || centers.includes(x2))) {
    throw new Error("Sequence message endpoints must attach to activation-bar edges, not lifeline centres");
  }
  if (messages.some(([x1, y1, x2]) =>
    (x1 === 796 || x2 === 796) &&
    !serverIntervals.some(([start, end]) => y1 > start && y1 < end))) {
    throw new Error("Every server message must sit inside a covering activation bar");
  }
  body += rect(448, 424, 424, 48, { fill: "rgba(45,49,66,0.02)", stroke: "rgba(45,49,66,0.22)", strokeWidth: 1, rx: 4 });
  body += rect(448, 424, 40, 16, { fill: C.paper, stroke: "rgba(45,49,66,0.22)", strokeWidth: 1, rx: 2 });
  body += text(468, 436, "OPT", { fill: C.muted, size: 8, family: F.mono, anchor: "middle", spacing: 0.12 });
  body += text(500, 460, "[P in test_order]", { fill: C.muted, size: 8, family: F.mono });
  for (const [x1, y1, x2, y2, stroke, marker, , , , , dash] of messages) body += line(x1, y1, x2, y2, { stroke, marker, strokeWidth: stroke === C.muted ? 1 : 1.2, dash: dash || (stroke === C.muted ? "5,4" : undefined) });
  for (const [, , , , , , value, x, y, width] of messages) body += label(x, y, width, value, value === "id <ULID>" ? C.accent : C.muted);
  body += node({ x: 80, y: 136, width: 160, height: 64, tag: "UI", title: "Main thread", sub: "postMessage", fill: "rgba(79,93,117,0.10)", stroke: C.soft, titleSize: 12 });
  body += node({ x: 400, y: 136, width: 160, height: 64, tag: "WORKER", title: "Web Worker", sub: "runNextTest", fill: C.accentTint, stroke: C.accent, titleSize: 12, focal: true });
  body += node({ x: 720, y: 136, width: 160, height: 64, tag: "GO", title: "Go server", sub: "HTTP handlers", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += text(56, 566, "消息端点接 activation bar 的外侧边缘；虚线生命线只表示时间。P 只有显式写进 test_order 才发生。", { fill: C.muted, size: 10, family: F.sans });
  return frame({ id, title: "Worker 合同：顺序由字符串驱动", description: "真实 Worker 时序展示主线程把 settings 交给 Web Worker，Worker 按默认 IP_D_U 调用 getIP、garbage、empty 和 telemetry；P 阶段只在 test_order 显式包含时出现。消息箭头连接激活框外边缘。", eyebrow: "PROTOCOL · WORKER", subtitle: "200 是一次 HTTP 操作的结果，不是整场测速的完成信号", body });
}

function evidenceBoundary() {
  const id = "speedtest-whitepaper-evidence-boundary";
  let body = sectionLabel(56, 152, "EVIDENCE BOUNDARY · 2026-08-26");
  body += rect(56, 180, 240, 236, { fill: C.linkTint, stroke: "rgba(46,90,168,0.28)", strokeWidth: 0.8, rx: 8 });
  body += rect(360, 180, 240, 236, { fill: "rgba(45,49,66,0.02)", stroke: C.rule, strokeWidth: 0.8, rx: 8 });
  body += rect(664, 180, 240, 236, { fill: C.accentTint, stroke: "rgba(235,108,54,0.36)", strokeWidth: 0.8, rx: 8, dash: "5,4" });
  body += sectionLabel(72, 204, "SOURCE FACTS", C.link);
  body += sectionLabel(376, 204, "LOCAL OBSERVATION", C.muted);
  body += sectionLabel(680, 204, "NOT ESTABLISHED", C.accent);
  body += node({ x: 80, y: 232, width: 192, height: 72, tag: "SOURCE", title: "speedtest-go", sub: "@ 59cff12", fill: C.white, stroke: C.link, titleSize: 16 });
  body += node({ x: 80, y: 328, width: 192, height: 64, tag: "CODE", title: "routes · Worker · DB", sub: "read from checkout", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 384, y: 232, width: 192, height: 72, tag: "RUN", title: "Darwin / arm64", sub: "127.0.0.1 · memory", fill: C.white, stroke: C.ink, titleSize: 16 });
  body += node({ x: 384, y: 328, width: 192, height: 64, tag: "LOG", title: "bytes · status · ID", sub: "evidence_run.log", fill: C.white, stroke: C.ink, titleSize: 12 });
  body += node({ x: 688, y: 232, width: 192, height: 72, tag: "OUT", titleLines: ["公网容量", "Linux / TLS"], sub: "not run here", fill: C.accentTint, stroke: C.accent, titleSize: 12, focal: true });
  body += node({ x: 688, y: 328, width: 192, height: 64, tag: "OUT", title: "10Gbps · p99 · HA", sub: "no evidence", fill: C.accentTint, stroke: C.accent, titleSize: 12 });
  body += line(272, 268, 384, 268, { stroke: C.link, marker: `${id}-arrow-link`, strokeWidth: 1.4 });
  body += line(600, 268, 688, 268, { stroke: C.accent, marker: `${id}-arrow-accent`, strokeWidth: 1.2, dash: "5,4" });
  body += label(296, 242, 72, "run", C.link);
  body += label(604, 242, 64, "boundary", C.accent);
  body += rect(56, 448, 848, 44, { fill: C.paper2, stroke: "none", rx: 4 });
  body += text(72, 476, "同一份源码可以支持更多部署入口，但“源码存在”与“该环境已验证”是两种不同证据。", { fill: C.ink, size: 12, family: F.sans, weight: 600 });
  body += legend([
    { x: 136, label: "SOURCE-SUPPORTED", fill: C.link },
    { x: 376, label: "LOCAL EVIDENCE", fill: C.muted },
    { x: 600, label: "UNVERIFIED CLAIM", fill: C.accent },
  ]);
  return frame({ id, title: "源码事实、运行观察和生产证明要分开", description: "证据边界图把 speedtest-go 的源码事实、本机 Darwin/arm64 loopback 运行观察，以及尚未验证的公网容量、Linux、TLS 和高可用部署分开。", eyebrow: "EVIDENCE · SCOPE", subtitle: "一张图提醒读者：可读到的实现，不自动升级成可运营的结果", body });
}

const diagrams = [
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
