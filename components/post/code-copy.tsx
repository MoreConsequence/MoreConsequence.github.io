"use client";

import { useEffect } from "react";

export function extractCleanCode(rawText: string): {
  cleanText: string;
  isShell: boolean;
  runnableCmd: string;
} {
  const lines = rawText.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  // 检查是否所有非空行均以终端提示符（$, #, >）开头
  const hasPromptPrefix =
    nonEmpty.length > 0 &&
    nonEmpty.every((l) => /^\s*[$#>]\s+/.test(l));

  let runnableCmd = "";
  const cleanedLines: string[] = [];

  for (const line of lines) {
    // 1. 过滤被标记为删除的 Diff 遗留行
    if (line.includes("// [!code --]")) {
      continue;
    }

    let processed = line;

    // 2. 剥离 Diff 新增与行高亮注解，保持纯净代码
    if (processed.includes("// [!code ++]")) {
      processed = processed.replace(/\s*\/\/\s*\[!code\s+\+\+\]/, "");
    }
    if (processed.includes("// [!code highlight]")) {
      processed = processed.replace(/\s*\/\/\s*\[!code\s+highlight\]/, "");
    }

    // 3. 若整段为交互命令，剥离前置提示符（$ 或 >）
    if (hasPromptPrefix) {
      processed = processed.replace(/^\s*[$#>]\s+/, "");
    }

    cleanedLines.push(processed);
  }

  const cleanText = cleanedLines.join("\n").trimEnd();

  // 识别首个可供虚拟终端执行的仿真命令
  const firstNonEmpty = cleanedLines.find((l) => l.trim().length > 0)?.trim() ?? "";
  const isShell =
    hasPromptPrefix ||
    /^(kubectl|crictl|bpftool|uname|curl|cat|docker|free|ip|help|theme)\b/.test(firstNonEmpty);

  if (isShell) {
    runnableCmd = firstNonEmpty;
  }

  return { cleanText, isShell, runnableCmd };
}

export function CodeCopy() {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLElement>(".article-prose pre");
    const containers: HTMLElement[] = [];

    blocks.forEach((block) => {
      // 避免重复挂载
      if (block.querySelector(".code-actions")) return;

      const rawContent = block.textContent ?? "";
      const { cleanText, isShell, runnableCmd } = extractCleanCode(rawContent);

      const actionWrapper = document.createElement("div");
      actionWrapper.className = "code-actions";

      // 若为 Shell 命令，注入“▶ 运行”直投虚拟终端按钮
      if (isShell && runnableCmd) {
        const runBtn = document.createElement("button");
        runBtn.className = "code-action-btn run";
        runBtn.type = "button";
        runBtn.textContent = "▶ 运行";
        runBtn.setAttribute("aria-label", "在 Web 终端运行此命令");
        runBtn.setAttribute("title", `在虚拟 Web 终端执行: ${runnableCmd}`);
        runBtn.addEventListener("click", () => {
          window.dispatchEvent(
            new CustomEvent("terminal-exec", {
              detail: { command: runnableCmd },
            })
          );
          runBtn.textContent = "已发送";
          window.setTimeout(() => {
            runBtn.textContent = "▶ 运行";
          }, 1200);
        });
        actionWrapper.append(runBtn);
      }

      // 智能纯净复制代码按钮
      const copyBtn = document.createElement("button");
      copyBtn.className = "code-action-btn copy";
      copyBtn.type = "button";
      copyBtn.textContent = "复制";
      copyBtn.setAttribute("aria-label", "复制纯净代码");
      copyBtn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(cleanText);
        copyBtn.textContent = "已复制";
        window.setTimeout(() => {
          copyBtn.textContent = "复制";
        }, 1600);
      });
      actionWrapper.append(copyBtn);

      block.append(actionWrapper);
      containers.push(actionWrapper);
    });

    return () => containers.forEach((container) => container.remove());
  }, []);

  return null;
}
