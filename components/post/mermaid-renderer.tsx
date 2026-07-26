"use client";

import { useEffect } from "react";
import mermaid from "mermaid";

export function MermaidRenderer() {
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      fontFamily: "var(--font-sans)",
      themeVariables: {
        darkMode: true,
        background: "#11172b",
        primaryColor: "#1e293b",
        primaryTextColor: "#f6f8ff",
        primaryBorderColor: "#38bdf8",
        lineColor: "#38bdf8",
        secondaryColor: "#1e293b",
        tertiaryColor: "#18213d",
      },
    });

    const processMermaidNodes = async () => {
      // Find all pre or code elements that represent mermaid diagrams
      const preNodes = Array.from(
        document.querySelectorAll<HTMLElement>(".article-prose pre"),
      );

      for (let i = 0; i < preNodes.length; i++) {
        const preEl = preNodes[i];
        if (!preEl || preEl.dataset.mermaidProcessed === "true") continue;

        const textContent = preEl.textContent || "";
        const trimmed = textContent.trim();

        // Check if this pre block contains Mermaid diagram syntax
        const isMermaid =
          preEl.classList.contains("language-mermaid") ||
          preEl.querySelector(".language-mermaid") !== null ||
          /^(graph|sequenceDiagram|stateDiagram|stateDiagram-v2|gantt|flowchart|classDiagram|erDiagram|journey|mindmap|pie)/m.test(
            trimmed,
          );

        if (!isMermaid) continue;

        preEl.dataset.mermaidProcessed = "true";

        const container = document.createElement("div");
        container.className = "mermaid-diagram-wrapper";
        const uniqueId = `mermaid-rendered-${Date.now()}-${i}`;

        try {
          // Clean up code text if Shiki added line numbers or headers
          const rawCode = trimmed
            .replace(/^#.*\n/gm, "")
            .replace(/```mermaid\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

          const { svg } = await mermaid.render(uniqueId, rawCode);
          container.innerHTML = svg;

          // Replace the raw code block pre element with the rendered SVG container
          preEl.parentNode?.replaceChild(container, preEl);
        } catch (error) {
          console.warn("Mermaid SVG render warning:", error);
          // If rendering fails, keep raw code block so text is visible
        }
      }
    };

    // Execute rendering after DOM mount
    processMermaidNodes();
  }, []);

  return null;
}
