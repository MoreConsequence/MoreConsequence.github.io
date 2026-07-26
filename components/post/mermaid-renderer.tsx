"use client";

import { useEffect, useState } from "react";
import mermaid from "mermaid";

export function MermaidRenderer() {
  const [activeSvg, setActiveSvg] = useState<string | null>(null);

  useEffect(() => {
    // Detect theme attribute from document root
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
            primaryBorderColor: "#38bdf8",
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

    const processMermaidNodes = async () => {
      const preNodes = Array.from(
        document.querySelectorAll<HTMLElement>(".article-prose pre"),
      );

      for (let i = 0; i < preNodes.length; i++) {
        const preEl = preNodes[i];
        if (!preEl || preEl.dataset.mermaidProcessed === "true") continue;

        const textContent = preEl.textContent || "";
        const trimmed = textContent.trim();

        // Detect if pre block is mermaid diagram
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
        wrapper.title = "点击放大查看高清图表";

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
              <span class="mermaid-zoom-hint">🔍 点击放大</span>
            </div>
            <div class="mermaid-svg-container">${svg}</div>
          `;

          // Add click listener for modal zoom
          wrapper.addEventListener("click", () => {
            setActiveSvg(svg);
          });

          preEl.parentNode?.replaceChild(wrapper, preEl);
        } catch (error) {
          console.warn("Mermaid rendering fallback:", error);
          // Keep raw block if rendering fails so text is not lost
        }
      }
    };

    processMermaidNodes();
  }, []);

  return (
    <>
      {activeSvg ? (
        <div
          className="mermaid-modal-backdrop"
          onClick={() => setActiveSvg(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="mermaid-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="mermaid-modal-close"
              onClick={() => setActiveSvg(null)}
              aria-label="关闭放大预览"
            >
              ✕
            </button>
            <div
              className="mermaid-modal-svg"
              dangerouslySetInnerHTML={{ __html: activeSvg }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
