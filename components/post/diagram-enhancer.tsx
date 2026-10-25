"use client";

import { useEffect } from "react";

/**
 * Technical Diagram Enhancer (参考 claude.dev 工业级图表标头与 [PNG] 导出)
 * 为文章正文内的所有矢量 SVG 架构图/流程图自动注入：
 * 1. 工业编号与图表标题 (FIG 01 // DIAGRAM TITLE)
 * 2. 格式指示器 (SVG 矢量标识)
 * 3. 动态 [PNG] 一键高清光栅化下载按钮 (Canvas 2x 高清导出)
 */
export function DiagramEnhancer() {
  useEffect(() => {
    const images = document.querySelectorAll<HTMLImageElement>(
      ".article-prose img[src*='.svg'], .article-prose img[src$='.svg']"
    );

    const cleanupFns: (() => void)[] = [];

    images.forEach((img, index) => {
      // 避免重复包装
      const parent = img.parentElement;
      if (!parent || parent.classList.contains("tech-diagram-container")) return;

      const altText = img.alt || "系统架构与交互时序图";
      const figNumber = String(index + 1).padStart(2, "0");

      // 创建容器 figure
      const figure = document.createElement("figure");
      figure.className = "tech-diagram-figure tech-diagram-container";

      // 工业级控制条 (Header)
      const header = document.createElement("div");
      header.className = "tech-diagram-header";

      const metaLeft = document.createElement("div");
      metaLeft.className = "tech-diagram-meta";
      metaLeft.innerHTML = `
        <span class="diagram-fig-badge">FIG ${figNumber}</span>
        <span class="diagram-spec-sep">//</span>
        <span class="diagram-title-text">${altText}</span>
      `;

      const actionsRight = document.createElement("div");
      actionsRight.className = "tech-diagram-actions";

      // [SVG] 原始文件链接
      const svgLink = document.createElement("a");
      svgLink.className = "tech-diagram-btn svg-btn";
      svgLink.href = img.src;
      svgLink.target = "_blank";
      svgLink.rel = "noreferrer";
      svgLink.textContent = "[svg]";
      svgLink.title = "在独立标签页打开原始矢量 SVG";

      // [PNG] 一键高清下载按钮
      const pngBtn = document.createElement("button");
      pngBtn.type = "button";
      pngBtn.className = "tech-diagram-btn png-btn";
      pngBtn.textContent = "[png]";
      pngBtn.title = "将本图光栅化并导出为高清 PNG";

      const handleExportPng = async () => {
        const originalText = pngBtn.textContent;
        pngBtn.textContent = "[...]";
        pngBtn.disabled = true;

        try {
          const resp = await fetch(img.src);
          const svgContent = await resp.text();
          const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(blob);

          const tempImg = new Image();
          tempImg.crossOrigin = "anonymous";

          tempImg.onload = () => {
            const scale = 2; // 2x Retina 清晰度
            const w = (tempImg.naturalWidth || img.naturalWidth || 800) * scale;
            const h = (tempImg.naturalHeight || img.naturalHeight || 500) * scale;

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");

            if (ctx) {
              // 绘制白底避免透明虚底
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(tempImg, 0, 0, w, h);

              URL.revokeObjectURL(url);
              const pngData = canvas.toDataURL("image/png");
              const dlLink = document.createElement("a");
              const safeName = altText.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-");
              dlLink.download = `fig-${figNumber}-${safeName}.png`;
              dlLink.href = pngData;
              dlLink.click();

              pngBtn.textContent = "[✓ done]";
            } else {
              pngBtn.textContent = originalText;
            }

            setTimeout(() => {
              pngBtn.textContent = originalText;
              pngBtn.disabled = false;
            }, 1800);
          };

          tempImg.onerror = () => {
            pngBtn.textContent = "[error]";
            setTimeout(() => {
              pngBtn.textContent = originalText;
              pngBtn.disabled = false;
            }, 2000);
          };

          tempImg.src = url;
        } catch {
          pngBtn.textContent = "[error]";
          setTimeout(() => {
            pngBtn.textContent = originalText;
            pngBtn.disabled = false;
          }, 2000);
        }
      };

      pngBtn.addEventListener("click", handleExportPng);
      actionsRight.appendChild(svgLink);
      actionsRight.appendChild(pngBtn);

      header.appendChild(metaLeft);
      header.appendChild(actionsRight);

      // 将 img 移入 figure 并提升至顶级容器，避免被段落 p 的 850px 宽度限制
      const originalParent = img.parentElement;
      if (originalParent) {
        if (originalParent.tagName === "P" && originalParent.children.length === 1 && !originalParent.textContent?.trim()) {
          originalParent.replaceWith(figure);
        } else {
          originalParent.insertBefore(figure, img);
        }
        figure.appendChild(header);
        figure.appendChild(img);
      }

      cleanupFns.push(() => {
        pngBtn.removeEventListener("click", handleExportPng);
      });
    });

    return () => {
      cleanupFns.forEach((fn) => fn());
    };
  }, []);

  return null;
}
