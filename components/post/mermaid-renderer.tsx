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
  const busy = useRef(false);

  useEffect(() => {
    const render = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const midnight =
          document.documentElement.getAttribute("data-theme") === "midnight";
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "loose",
          fontFamily:
            'ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
          themeVariables: themeVars(midnight),
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
              `<div class="mt-bar">`,
              `<button class="mt-tab active" data-v="p">Diagram</button>`,
              `<button class="mt-tab" data-v="c">Source</button>`,
              `</div>`,
              `<div class="mt-view mt-pv">${svg}</div>`,
              `<div class="mt-view mt-cd" style="display:none"><pre>${escHtml(src)}</pre></div>`,
            ].join("");

            el.querySelector(".mt-pv")!.addEventListener("click", () =>
              setModal({ type: "svg", content: svg }),
            );

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
          setModal({ type: "image", content: img.src }),
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

  if (!modal) return null;

  return createPortal(
    <div
      className="mt-backdrop"
      onClick={() => setModal(null)}
      role="dialog"
      aria-modal="true"
    >
      <div className="mt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="mt-close" onClick={() => setModal(null)}>
          ✕
        </button>
        {modal.type === "svg" ? (
          <div
            className="mt-svg"
            dangerouslySetInnerHTML={{ __html: modal.content }}
          />
        ) : (
          <img src={modal.content} alt="" className="mt-img" />
        )}
      </div>
    </div>,
    document.body,
  );
}
