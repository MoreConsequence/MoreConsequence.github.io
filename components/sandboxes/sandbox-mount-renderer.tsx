"use client";

import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LLMCalculator } from "./llm-calculator";
import { RaftSimulator } from "./raft-simulator";
import { VectorClockSimulator } from "./vector-clock-simulator";
import { TCPacingSimulator } from "./tc-pacing-simulator";

const SANDBOX_MAP: Record<string, React.ReactElement> = {
  "llm-calculator": <LLMCalculator />,
  "raft-simulator": <RaftSimulator />,
  "vector-clock": <VectorClockSimulator />,
  "tc-pacing": <TCPacingSimulator />,
};

export function SandboxMountRenderer() {
  useEffect(() => {
    const containers = document.querySelectorAll<HTMLElement>(".interactive-sandbox");
    const roots: Root[] = [];

    containers.forEach((container) => {
      // Check if already mounted
      if (container.dataset.mounted === "true") return;

      const sandboxType = container.getAttribute("data-sandbox");
      if (!sandboxType || !SANDBOX_MAP[sandboxType]) return;

      container.dataset.mounted = "true";
      const root = createRoot(container);
      root.render(SANDBOX_MAP[sandboxType]);
      roots.push(root);
    });

    return () => {
      // Cleanup on unmount if needed
    };
  }, []);

  return null;
}
