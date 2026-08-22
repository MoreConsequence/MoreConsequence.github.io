"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mermaid from "mermaid";

const themeVars = (dark: boolean) =>
  dark
    ? {
        darkMode: true,
        background: "#11172b",
        primaryColor: "#1e3a5f",
        primaryTextColor: "#e2e8f0",
        primaryBorderColor: "#60a5fa",
        lineColor: "#60a5fa",
        secondaryColor: "#1e293b",
        tertiaryColor: "#0f172a",
        clusterBkg: "#0f172a",
        clusterBorder: "#334155",
        edgeLabelBackground: "#1e293b",
        nodeBorder: "#60a5fa",
        mainBkg: "#1e3a5f",
        nodeTextColor: "#e2e8f0",
        titleColor: "#f1f5f9",
        actorBorder: "#60a5fa",
        actorBkg: "#1e3a5f",
        actorTextColor: "#e2e8f0",
        signalColor: "#60a5fa",
        signalTextColor: "#e2e8f0",
        labelBoxBkgColor: "#1e293b",
        labelBoxBorderColor: "#60a5fa",
        labelTextColor: "#94a3b8",
        loopTextColor: "#94a3b8",
        noteBkgColor: "#1e293b",
        noteBorderColor: "#475569",
        sequenceNumberColor: "#94a3b8",
      }
    : {
        darkMode: false,
        background: "#ffffff",
        primaryColor: "#eef2ff",
        primaryTextColor: "#1e293b",
        primaryBorderColor: "#6366f1",
        lineColor: "#6366f1",
        secondaryColor: "#f8faff",
        tertiaryColor: "#f1f5f9",
        clusterBkg: "#fafbff",
        clusterBorder: "#d7def0",
        edgeLabelBackground: "#ffffff",
        nodeBorder: "#6366f1",
        mainBkg: "#eef2ff",
        nodeTextColor: "#1e293b",
        titleColor: "#0f172a",
        actorBorder: "#6366f1",
        actorBkg: "#eef2ff",
        actorTextColor: "#1e293b",
        signalColor: "#6366f1",
        signalTextColor: "#1e293b",
        labelBoxBkgColor: "#f8faff",
        labelBoxBorderColor: "#6366f1",
        labelTextColor: "#475569",
        loopTextColor: "#475569",
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
        sequenceNumberColor: "#6b6a64",
      };

const kamiFontStack =
  'Charter, Georgia, "TsangerJinKai02", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif';
const defaultFontStack =
  'ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

function escHtml(text: string) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

export function MermaidRenderer() {
  const [modal, setModal] = useState<{
    type: "svg" | "image";
    content: string;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

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
      if (busy.current) return;
      busy.current = true;
      try {
        const theme =
          document.documentElement.getAttribute("data-theme") ?? "";
        const isKami = ["kami", "kamisha", "kamiao", "kamisumi"].includes(
          theme,
        );
        const dark = theme === "kamisumi";
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "loose",
          fontFamily: isKami ? kamiFontStack : defaultFontStack,
          themeVariables: isKami ? kamiThemeVars(dark) : themeVars(dark),
        });
        await mermaid.run({ querySelector: ".mermaid" });

        document
          .querySelectorAll<HTMLElement>(
            ".mermaid[data-processed]:not([data-tog])",
          )
          .forEach((el) => {
            el.dataset.tog = "1";
            const src = el.getAttribute("data-src") || "";
            const svg = el.innerHTML;

            el.innerHTML = [
              `<div class="mt-bar" role="toolbar" aria-label="Mermaid 图示工具">`,
              `<div class="mt-tabs">`,
              `<button type="button" class="mt-tab active" data-v="p">Diagram</button>`,
              `<button type="button" class="mt-tab" data-v="c">Source</button>`,
              `</div>`,
              `<button type="button" class="mt-open" aria-label="放大查看 Mermaid 图">放大查看</button>`,
              `</div>`,
              `<div class="mt-view mt-pv">${svg}</div>`,
              `<div class="mt-view mt-cd" style="display:none"><pre>${escHtml(src)}</pre></div>`,
            ].join("");

            el.querySelector(".mt-pv")!.addEventListener("click", () =>
              openModal({ type: "svg", content: svg }),
            );

            el.querySelector(".mt-open")!.addEventListener("click", (event) => {
              event.stopPropagation();
              openModal({ type: "svg", content: svg });
            });

            el.querySelector(".mt-bar")!.addEventListener("click", (e) => {
              const btn = (e.target as HTMLElement).closest(
                ".mt-tab",
              ) as HTMLElement;
              if (!btn) return;
              const v = btn.dataset.v;
              el.querySelectorAll(".mt-tab").forEach((b) =>
                b.classList.remove("active"),
              );
              btn.classList.add("active");
              el.querySelectorAll(".mt-view").forEach((view) => {
                (view as HTMLElement).style.display =
                  view.classList.contains(v === "p" ? "mt-pv" : "mt-cd")
                    ? ""
                    : "none";
              });
            });
          });
      } finally {
        busy.current = false;
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
          const src = el.getAttribute("data-src");
          if (src) el.textContent = src;
        });
      render();
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

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
            <img src={modal.content} alt="放大查看的图示" className="mt-img" />
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
