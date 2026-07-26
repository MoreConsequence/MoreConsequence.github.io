"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import mermaid from "mermaid";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function MermaidRenderer() {
  const [modalContent, setModalContent] = useState<{
    type: "svg" | "image";
    content: string;
  } | null>(null);

  const isClient = useIsClient();

  useEffect(() => {
    const currentTheme =
      document.documentElement.getAttribute("data-theme") || "paper";
    const isMidnight = currentTheme === "midnight";

    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
      fontFamily:
        'ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
      themeVariables: isMidnight
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
          },
    });

    const processContent = async () => {
      // 1. Process Mermaid code blocks
      const preNodes = Array.from(
        document.querySelectorAll<HTMLElement>(".article-prose pre"),
      );

      for (let i = 0; i < preNodes.length; i++) {
        const preEl = preNodes[i];
        if (!preEl || preEl.dataset.mermaidProcessed === "true") continue;

        const textContent = preEl.textContent || "";
        const trimmed = textContent.trim();

        const isMermaid =
          preEl.classList.contains("language-mermaid") ||
          preEl.querySelector(".language-mermaid") !== null ||
          /^(graph|sequenceDiagram|stateDiagram|stateDiagram-v2|gantt|flowchart|classDiagram|erDiagram|journey|mindmap|pie)/m.test(
            trimmed,
          );

        if (!isMermaid) continue;

        preEl.dataset.mermaidProcessed = "true";

        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-diagram-wrapper";

        const uniqueId = `mermaid-rendered-${Date.now()}-${i}`;

        try {
          const rawCode = trimmed
            .replace(/^#.*\n/gm, "")
            .replace(/```mermaid\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

          const { svg } = await mermaid.render(uniqueId, rawCode);

          // Remove root SVG inline style so CSS handles responsive sizing
          const scaledSvg = svg.replace(/(<svg[^>]+) style="[^"]*"/i, "$1");

          wrapper.innerHTML = `
            <div class="mermaid-diagram-header">
              <span class="mermaid-badge">ARCHITECTURAL DIAGRAM</span>
              <span class="mermaid-zoom-hint">🔍 点击可全屏放大</span>
            </div>
            <div class="mermaid-svg-container">${scaledSvg}</div>
          `;

          // Clicking wrapper opens original full SVG in zoom modal
          wrapper.addEventListener("click", () => {
            setModalContent({ type: "svg", content: svg });
          });

          preEl.parentNode?.replaceChild(wrapper, preEl);
        } catch (error) {
          console.error("Mermaid diagram rendering error:", error);
          const errDiv = document.createElement("div");
          errDiv.className = "mermaid-render-error";
          errDiv.innerHTML = `<small style="color: #ef4444; padding: 0.5rem; display: block;">⚠️ Diagram rendering error: ${
            error instanceof Error ? error.message : "Syntax Error"
          }</small>`;
          preEl.appendChild(errDiv);
        }
      }

      // 2. Process article images for click-to-zoom
      const imgNodes = Array.from(
        document.querySelectorAll<HTMLImageElement>(".article-prose img"),
      );

      imgNodes.forEach((img) => {
        if (img.dataset.zoomConfigured === "true") return;
        img.dataset.zoomConfigured = "true";
        img.style.cursor = "zoom-in";
        img.title = "点击全屏查看高清大图";
        img.addEventListener("click", () => {
          setModalContent({ type: "image", content: img.src });
        });
      });
    };

    processContent();
  }, []);

  if (!isClient) return null;

  return (
    <>
      {modalContent
        ? createPortal(
            <div
              className="mermaid-modal-backdrop"
              onClick={() => setModalContent(null)}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="mermaid-modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="mermaid-modal-close"
                  onClick={() => setModalContent(null)}
                  aria-label="关闭预览"
                >
                  ✕
                </button>
                {modalContent.type === "svg" ? (
                  <div
                    className="mermaid-modal-svg"
                    dangerouslySetInnerHTML={{ __html: modalContent.content }}
                  />
                ) : (
                  <div className="mermaid-modal-image-wrapper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={modalContent.content}
                      alt="Full screen preview"
                      className="mermaid-modal-image"
                    />
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
