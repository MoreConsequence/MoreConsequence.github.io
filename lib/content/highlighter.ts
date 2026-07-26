import { createHighlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

let highlighter: ReturnType<typeof createHighlighter> | undefined;

export function createBlogHighlighter() {
  highlighter ??= createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: [
      "javascript",
      "typescript",
      "tsx",
      "json",
      "bash",
      "shellscript",
      "go",
      "rust",
      "python",
      "yaml",
      "markdown",
      "html",
      "css",
      "sql",
    ],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}
