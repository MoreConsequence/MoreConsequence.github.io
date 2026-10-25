"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import mermaid from "mermaid";

const themeVars = (dark: boolean) =>
  dark
    ? {
        darkMode: true,
        background: "transparent",
        primaryColor: "#161b22",
        primaryTextColor: "#f0f6fc",
        primaryBorderColor: "#388bfd",
        lineColor: "#58a6ff",
        secondaryColor: "#21262d",
        tertiaryColor: "#0d1117",
        clusterBkg: "#0d1117",
        clusterBorder: "#30363d",
        edgeLabelBackground: "#161b22",
        nodeBorder: "#388bfd",
        mainBkg: "#161b22",
        nodeTextColor: "#f0f6fc",
        titleColor: "#f0f6fc",
        actorBorder: "#388bfd",
        actorBkg: "#161b22",
        actorTextColor: "#f0f6fc",
        signalColor: "#58a6ff",
        signalTextColor: "#f0f6fc",
        labelBoxBkgColor: "#161b22",
        labelBoxBorderColor: "#388bfd",
        labelTextColor: "#8b949e",
        loopTextColor: "#8b949e",
        noteBkgColor: "#21262d",
        noteBorderColor: "#d29922",
        sequenceNumberColor: "#8b949e",
      }
    : {
        darkMode: false,
        background: "transparent",
        primaryColor: "#f0f4f9",
        primaryTextColor: "#0f172a",
        primaryBorderColor: "#2563eb",
        lineColor: "#2563eb",
        secondaryColor: "#e2e8f0",
        tertiaryColor: "#ffffff",
        clusterBkg: "#f8fafc",
        clusterBorder: "#cbd5e1",
        edgeLabelBackground: "#ffffff",
        nodeBorder: "#2563eb",
        mainBkg: "#f0f4f9",
        nodeTextColor: "#0f172a",
        titleColor: "#0f172a",
        actorBorder: "#2563eb",
        actorBkg: "#f0f4f9",
        actorTextColor: "#0f172a",
        signalColor: "#2563eb",
        signalTextColor: "#0f172a",
        labelBoxBkgColor: "#f8fafc",
        labelBoxBorderColor: "#2563eb",
        labelTextColor: "#334155",
        loopTextColor: "#334155",
        noteBkgColor: "#fef9e7",
        noteBorderColor: "#eab308",
        sequenceNumberColor: "#64748b",
      };

/* kami 技能 mermaid-theme.json 角色映射：
   bg 羊皮纸 / fg 近黑 / line 暖橄榄 / accent 墨蓝（唯一彩色）
   / muted 石青 / surface 象牙 / border 暖沙 */
const kamiThemeVars = (dark: boolean) =>
  dark
    ? {
        darkMode: true,
        background: "#141413",
        primaryColor: "#222420",
        primaryTextColor: "#e6e4dc",
        primaryBorderColor: "#9db4d6",
        lineColor: "#8a9bb8",
        secondaryColor: "#282a26",
        tertiaryColor: "#1c1d1b",
        clusterBkg: "#1c1d1b",
        clusterBorder: "#3a3d36",
        edgeLabelBackground: "#222420",
        nodeBorder: "#9db4d6",
        mainBkg: "#222420",
        nodeTextColor: "#e6e4dc",
        titleColor: "#f1efe8",
        actorBorder: "#9db4d6",
        actorBkg: "#222420",
        actorTextColor: "#e6e4dc",
        signalColor: "#c8a06b",
        signalTextColor: "#e6e4dc",
        labelBoxBkgColor: "#222420",
        labelBoxBorderColor: "#9db4d6",
        labelTextColor: "#8b8a83",
        loopTextColor: "#8b8a83",
        noteBkgColor: "#2a2c28",
        noteBorderColor: "#c8a06b",
        sequenceNumberColor: "#8b8a83",
      }
    : {
        darkMode: false,
        background: "#f5f4ed",
        primaryColor: "#faf9f5",
        primaryTextColor: "#141413",
        primaryBorderColor: "#1b365d",
        lineColor: "#504e49",
        secondaryColor: "#faf9f5",
        tertiaryColor: "#e8e6dc",
        clusterBkg: "#faf9f5",
        clusterBorder: "#e8e6dc",
        edgeLabelBackground: "#f5f4ed",
        nodeBorder: "#1b365d",
        mainBkg: "#faf9f5",
        nodeTextColor: "#141413",
        titleColor: "#141413",
        actorBorder: "#1b365d",
        actorBkg: "#faf9f5",
        actorTextColor: "#141413",
        signalColor: "#1b365d",
        signalTextColor: "#141413",
        labelBoxBkgColor: "#faf9f5",
        labelBoxBorderColor: "#1b365d",
        labelTextColor: "#6b6a64",
        loopTextColor: "#6b6a64",
        noteBkgColor: "#f0e0d8",
        noteBorderColor: "#8a6f3c",
        sequenceNumberColor: "#64748b",
      };

const kamiFontStack =
  'Charter, Georgia, "TsangerJinKai02", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif';
const defaultFontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';

function escHtml(text: string) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

export function MermaidRenderer() {
  const pathname = usePathname();
  const [modal, setModal] = useState<{
    type: "svg" | "image";
    content: string;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const pending = useRef(false);

  const openModal = (next: { type: "svg" | "image"; content: string }) => {
    setZoom(1);
    setModal(next);
  };

  const closeModal = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    setIsFullscreen(false);
    setZoom(1);
    setModal(null);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await modalRef.current?.requestFullscreen?.();
      }
    } catch {
      // Fullscreen can be denied by an embedded browser; the modal remains useful.
    }
  };

  useEffect(() => {
    const render = async () => {
      if (busy.current) {
        pending.current = true;
        return;
      }
      busy.current = true;
      try {
        const theme =
          document.documentElement.getAttribute("data-theme") ?? "";
        const isKami = ["kami", "kamisha", "kamiao", "kamisumi"].includes(
          theme,
        );
        // midnight is light cream (#f8f2e7). Only yoruichi, kenpachi, and kamisumi are dark.
        const dark = ["kamisumi", "yoruichi", "kenpachi"].includes(theme);
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "loose",
          suppressErrorRendering: true,
          fontFamily: isKami ? kamiFontStack : defaultFontStack,
          fontSize: 14,
          themeVariables: isKami ? kamiThemeVars(dark) : themeVars(dark),
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
            curve: "basis",
          },
          sequence: {
            useMaxWidth: false,
            showSequenceNumbers: true,
          },
        });

        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(".mermaid:not([data-processed])"),
        );
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const src = el.getAttribute("data-src") || el.textContent || "";
          if (!src.trim()) continue;

          el.dataset.processed = "true";
          el.dataset.tog = "1";

          // 提取图表描述标题
          const titleMatch = src.match(/title\s+([^\n\r]+)/i);
          const subgraphMatch = src.match(/subgraph\s+[A-Za-z0-9_-]+\["([^"]+)"\]/);
          const diagramTitle =
            titleMatch?.[1]?.trim() ||
            (subgraphMatch?.[1] ? subgraphMatch[1].replace(/^[❌✅⚠️\s]+/, "").trim() : "逻辑流程与系统架构");

          try {
            const renderId = `mermaid-render-${Date.now()}-${i}`;
            const { svg } = await mermaid.render(renderId, src);

            el.innerHTML = [
              `<div class="tech-diagram-header mermaid-header" role="toolbar" aria-label="Mermaid 架构图示">`,
              `<div class="tech-diagram-meta">`,
              `<span class="diagram-fig-badge">DIAGRAM</span>`,
              `<span class="diagram-spec-sep">//</span>`,
              `<span class="diagram-title-text">${escHtml(diagramTitle)}</span>`,
              `</div>`,
              `<div class="tech-diagram-actions">`,
              `<button type="button" class="tech-diagram-btn mt-tab active" data-v="p" title="查看渲染图示">[preview]</button>`,
              `<button type="button" class="tech-diagram-btn mt-tab" data-v="c" title="查看 Mermaid 源码">[source]</button>`,
              `<button type="button" class="tech-diagram-btn mt-png" title="导出 2x 高清 PNG 图">[png]</button>`,
              `<button type="button" class="tech-diagram-btn mt-open" title="全屏放大查看">[zoom]</button>`,
              `</div>`,
              `</div>`,
              `<div class="mt-view mt-pv">${svg}</div>`,
              `<div class="mt-view mt-cd" style="display:none"><pre>${escHtml(src)}</pre></div>`,
            ].join("");

            // 视图切换
            el.querySelector(".mermaid-header")?.addEventListener("click", (e) => {
              const btn = (e.target as HTMLElement).closest(".mt-tab") as HTMLElement;
              if (!btn) return;
              const v = btn.dataset.v;
              el.querySelectorAll(".mt-tab").forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
              el.querySelectorAll(".mt-view").forEach((view) => {
                (view as HTMLElement).style.display =
                  view.classList.contains(v === "p" ? "mt-pv" : "mt-cd") ? "" : "none";
              });
            });

            // 点击图表与放大按钮打开全屏 Portal
            el.querySelector(".mt-pv")?.addEventListener("click", () =>
              openModal({ type: "svg", content: svg }),
            );

            el.querySelector(".mt-open")?.addEventListener("click", (event) => {
              event.stopPropagation();
              openModal({ type: "svg", content: svg });
            });

            // 导出 2x 高清 PNG
            el.querySelector(".mt-png")?.addEventListener("click", (event) => {
              event.stopPropagation();
              const svgEl = el.querySelector<SVGElement>(".mt-pv svg");
              if (!svgEl) return;
              const svgString = new XMLSerializer().serializeToString(svgEl);
              const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = () => {
                const scale = 2;
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(svgEl.clientWidth || 800, 600) * scale;
                canvas.height = Math.max(svgEl.clientHeight || 400, 300) * scale;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.fillStyle = dark ? "#0d1117" : "#ffffff";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  URL.revokeObjectURL(url);
                  const a = document.createElement("a");
                  a.download = `diagram-${diagramTitle.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")}.png`;
                  a.href = canvas.toDataURL("image/png");
                  a.click();
                }
              };
              img.src = url;
            });
          } catch (err) {
            console.warn("Mermaid diagram render error:", err);
            el.innerHTML = [
              `<div class="tech-diagram-header mermaid-header" role="toolbar" aria-label="Mermaid 图示工具">`,
              `<div class="tech-diagram-meta">`,
              `<span class="diagram-fig-badge">DIAGRAM</span>`,
              `<span class="diagram-spec-sep">//</span>`,
              `<span class="diagram-title-text">${escHtml(diagramTitle)}</span>`,
              `</div>`,
              `<div class="tech-diagram-actions">`,
              `<button type="button" class="tech-diagram-btn mt-tab active" data-v="c">[source]</button>`,
              `</div>`,
              `</div>`,
              `<div class="mt-view mt-cd"><pre>${escHtml(src)}</pre></div>`,
            ].join("");
          }
        }
      } finally {
        busy.current = false;
        if (pending.current) {
          pending.current = false;
          void render();
        }
      }
    };

    render();

    document
      .querySelectorAll<HTMLImageElement>(".article-prose img:not([data-mz])")
      .forEach((img) => {
        img.dataset.mz = "1";
        img.style.cursor = "zoom-in";
        img.addEventListener("click", () =>
          openModal({ type: "image", content: img.src }),
        );
      });

    const obs = new MutationObserver(() => {
      document
        .querySelectorAll<HTMLElement>(".mermaid[data-processed]")
        .forEach((el) => {
          el.removeAttribute("data-processed");
          el.removeAttribute("data-tog");
        });
      render();
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, [pathname]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!modal) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modal]);

  if (!modal) return null;

  return createPortal(
    <div
      className="mt-backdrop"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label="Mermaid 图示放大查看"
    >
      <div
        className="mt-modal"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mt-modal-head">
          <strong>图示放大查看</strong>
          <div className="mt-modal-actions">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}
              aria-label="缩小图示"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="重置图示大小"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
              aria-label="放大图示"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "退出全屏" : "全屏显示图示"}
            >
              {isFullscreen ? "退出全屏" : "全屏"}
            </button>
            <button
              type="button"
              className="mt-close"
              onClick={closeModal}
              aria-label="关闭图示"
              autoFocus
            >
              关闭
            </button>
          </div>
        </div>
        <div className="mt-stage">
        {modal.type === "svg" ? (
          <div
            className="mt-zoom-canvas mt-svg-canvas"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <div
              className="mt-svg"
              dangerouslySetInnerHTML={{ __html: modal.content }}
            />
          </div>
        ) : (
          <div
            className="mt-zoom-canvas mt-image-canvas"
            style={{ transform: `scale(${zoom})` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modal.content} alt="放大查看的图示" className="mt-img" />
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
