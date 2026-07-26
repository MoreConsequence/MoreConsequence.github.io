"use client";

import { useEffect } from "react";

export function CodeCopy() {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLElement>(".article-prose pre");
    const buttons: HTMLButtonElement[] = [];

    blocks.forEach((block) => {
      const button = document.createElement("button");
      button.className = "code-copy";
      button.type = "button";
      button.textContent = "复制";
      button.setAttribute("aria-label", "复制代码");
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(block.textContent ?? "");
        button.textContent = "已复制";
        window.setTimeout(() => {
          button.textContent = "复制";
        }, 1600);
      });
      block.append(button);
      buttons.push(button);
    });

    return () => buttons.forEach((button) => button.remove());
  }, []);

  return null;
}
