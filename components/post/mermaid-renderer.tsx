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
      theme: isMidnight ? "dark" : "neutral",
      securityLevel: "loose",
      fontFamily: "var(--font-sans)",
      themeVariables: isMidnight
        ? {
            darkMode: true,
            background: "#11172b",
            primaryColor: "#1e293b",
            primaryTextColor: "#f8fafc",
            primaryBorderColor: "#0284c7",
            lineColor: "#38bdf8",
            secondaryColor: "#18213d",
            tertiaryColor: "#0f172a",
          }
        : {
            darkMode: false,
            background: "#ffffff",
            primaryColor: "#f0f3ff",
            primaryTextColor: "#171a33",
            primaryBorderColor: "#5b5fe8",
            lineColor: "#5b5fe8",
            secondaryColor: "#eef2ff",
            tertiaryColor: "#f7f9ff",
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
          wrapper.innerHTML = `
            <div class="mermaid-diagram-header">
              <span class="mermaid-badge">ARCHITECTURAL DIAGRAM</span>
              <span class="mermaid-zoom-hint">🔍 点击可全屏放大</span>
            </div>
            <div class="mermaid-svg-container">${svg}</div>
          `;

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
