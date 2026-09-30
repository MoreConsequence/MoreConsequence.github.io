import type { ShikiTransformer } from "shiki";

/**
 * Shiki transformer to support diff and line highlighting notations:
 * - `// [!code ++]` or `# [!code ++]` -> marks line as added (.diff.add)
 * - `// [!code --]` or `# [!code --]` -> marks line as removed (.diff.remove)
 * - `// [!code highlight]` or `# [!code highlight]` -> marks line as highlighted (.highlighted)
 */
export function createCodeNotationTransformer(): ShikiTransformer {
  return {
    name: "shiki-code-notation",
    line(node) {
      if (!node.children || node.children.length === 0) return;

      const diffAddRegex = /\s*(?:\/\/|#|\/\*)\s*\[!code \+\+\](?:\s*\*\/)?/;
      const diffRemoveRegex = /\s*(?:\/\/|#|\/\*)\s*\[!code --\](?:\s*\*\/)?/;
      const highlightRegex = /\s*(?:\/\/|#|\/\*)\s*\[!code highlight\](?:\s*\*\/)?/;

      let isAdd = false;
      let isRemove = false;
      let isHighlight = false;

      function checkAndClean(n: unknown): void {
        if (!n || typeof n !== "object") return;
        const item = n as { type?: string; value?: string; children?: unknown[] };
        if (item.type === "text" && typeof item.value === "string") {
          if (diffAddRegex.test(item.value)) {
            isAdd = true;
            item.value = item.value.replace(diffAddRegex, "");
          }
          if (diffRemoveRegex.test(item.value)) {
            isRemove = true;
            item.value = item.value.replace(diffRemoveRegex, "");
          }
          if (highlightRegex.test(item.value)) {
            isHighlight = true;
            item.value = item.value.replace(highlightRegex, "");
          }
        } else if (Array.isArray(item.children)) {
          item.children.forEach(checkAndClean);
        }
      }

      checkAndClean(node);

      if (isAdd || isRemove || isHighlight) {
        node.properties = node.properties || {};
        const existingClass = String(
          node.properties.class || node.properties.className || ""
        );

        let extra = "";
        if (isAdd) {
          extra = "diff add";
        } else if (isRemove) {
          extra = "diff remove";
        } else if (isHighlight) {
          extra = "highlighted";
        }

        const merged = `${existingClass} ${extra}`.trim();
        node.properties.class = merged;
        delete (node.properties as Record<string, unknown>).className;
      }
    },
  };
}
