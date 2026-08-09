import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlogHighlighter } from "@/lib/content/highlighter";

describe("Worker-compatible syntax highlighting", () => {
  const originalInstantiate = WebAssembly.instantiate;

  afterEach(() => {
    WebAssembly.instantiate = originalInstantiate;
    vi.restoreAllMocks();
  });

  it("highlights code when WebAssembly compilation is unavailable", async () => {
    WebAssembly.instantiate = vi.fn(() => {
      throw new Error("Wasm code generation disallowed by embedder");
    }) as typeof WebAssembly.instantiate;

    const highlighter = await createBlogHighlighter();
    const html = highlighter.codeToHtml("const answer = 42", {
      lang: "javascript",
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      defaultColor: false,
    });

    expect(html).toContain("shiki");
    expect(html).toContain("answer");
  });

  it("loads every language used by the blog", async () => {
    const highlighter = await createBlogHighlighter();
    const languages = [
      "javascript",
      "js",
      "typescript",
      "tsx",
      "json",
      "bash",
      "go",
      "sql",
      "yaml",
      "python",
      "c",
      "asm",
      "nginx",
      "dockerfile",
      "ini",
      "text",
    ];

    for (const lang of languages) {
      const html = highlighter.codeToHtml("sample", {
        lang,
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
        defaultColor: false,
      });
      expect(html, `language ${lang}`).toContain("shiki");
    }
  });
});
