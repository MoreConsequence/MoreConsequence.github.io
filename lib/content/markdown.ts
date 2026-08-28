import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import katex from "katex";
import readingTime from "reading-time";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { createBlogHighlighter } from "./highlighter";
import type { TocItem } from "./types";

type MarkdownNode = {
  type?: string;
  value?: string;
  depth?: number;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
};

function nodeText(node: MarkdownNode): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return node.value ?? "";
  }

  return (node.children ?? []).map(nodeText).join("");
}

function isFootnoteLabel(node: MarkdownNode) {
  const className = node.properties?.className;
  const classes = Array.isArray(className)
    ? className
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];

  return (
    node.properties?.id === "footnote-label" || classes.includes("sr-only")
  );
}

function collectHtmlHeadings(toc: TocItem[]) {
  return () => (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (
        node.type === "element" &&
        ["h2", "h3"].includes(node.tagName ?? "") &&
        !isFootnoteLabel(node)
      ) {
        const title = nodeText(node);
        const id = node.properties?.id;
        if (typeof id !== "string") return;
        toc.push({
          id,
          title,
          depth: Number(node.tagName?.slice(1)),
        });
      }

      node.children?.forEach(walk);
    };

    walk(tree);
  };
}

function rehypeMermaid() {
  return (tree: MarkdownNode) => {
    function walk(node: MarkdownNode, index: number | null, parent: MarkdownNode | null) {
      if (node.type === "element" && node.tagName === "pre" && parent && index !== null) {
        const codeEl = node.children?.[0];
        const classes = (
          Array.isArray(codeEl?.properties?.className) ? codeEl.properties.className : []
        ) as string[];
        if (codeEl?.type === "element" && codeEl.tagName === "code" && classes.includes("language-mermaid")) {
          const text = (codeEl.children ?? []).map((c: MarkdownNode) => (c.value ?? "")).join("");
          parent.children![index] = {
            type: "element",
            tagName: "div",
            properties: { className: ["mermaid"], dataSrc: text },
            children: [{ type: "text", value: text }],
          };
          return;
        }
      }
      node.children?.forEach((child, i) => walk(child, i, node));
    }
    walk(tree, null, null);
  };
}

function rehypeNormalizeImagePaths() {
  return (tree: MarkdownNode) => {
    function walk(node: MarkdownNode) {
      if (node.type === "element" && node.tagName === "img" && node.properties?.src) {
        const src = String(node.properties.src);
        if (src.includes("public/images/")) {
          node.properties.src = src.replace(/^.*public\/images\//, "/images/");
        } else if (src.includes("public/diagrams/")) {
          node.properties.src = src.replace(/^.*public\/diagrams\//, "/diagrams/");
        }
      }
      node.children?.forEach(walk);
    }
    walk(tree);
  };
}

function rehypeKatexNative() {
  return (tree: MarkdownNode) => {
    function walk(node: MarkdownNode) {
      if (node.type === "element" && ["pre", "code", "script", "style"].includes(node.tagName ?? "")) {
        return;
      }

      if (node.type === "element" && node.tagName === "p" && node.children) {
        const text = node.children
          .filter((c) => c.type === "text")
          .map((c) => c.value ?? "")
          .join("");
        const blockMatch = text.trim().match(/^\$\$([\s\S]+?)\$\$$/);
        if (blockMatch && node.children.length === 1) {
          try {
            const html = katex.renderToString(blockMatch[1].trim(), {
              displayMode: true,
              throwOnError: false,
              strict: "ignore",
            });
            node.tagName = "div";
            node.properties = { className: ["katex-block-wrapper"] };
            node.children = [{ type: "raw", value: html }];
            return;
          } catch {
            // fallback to default
          }
        }
      }

      if (node.children) {
        const newChildren: MarkdownNode[] = [];
        for (const child of node.children) {
          if (child.type === "text" && child.value && !["pre", "code"].includes(node.tagName ?? "")) {
            const val = child.value;
            const mathRegex = /(\$\$[\s\S]+?\$\$|(?<!\\)\$[^\s\$](?:[^\$\n]*?[^\s\$])?\$)/g;
            if (mathRegex.test(val)) {
              let lastIndex = 0;
              mathRegex.lastIndex = 0;
              let match: RegExpExecArray | null;
              while ((match = mathRegex.exec(val)) !== null) {
                if (match.index > lastIndex) {
                  newChildren.push({ type: "text", value: val.slice(lastIndex, match.index) });
                }
                const rawMath = match[0];
                const isDisplay = rawMath.startsWith("$$");
                const mathContent = isDisplay ? rawMath.slice(2, -2).trim() : rawMath.slice(1, -1).trim();
                try {
                  const html = katex.renderToString(mathContent, {
                    displayMode: isDisplay,
                    throwOnError: false,
                    strict: "ignore",
                  });
                  newChildren.push({ type: "raw", value: html });
                } catch {
                  newChildren.push({ type: "text", value: rawMath });
                }
                lastIndex = mathRegex.lastIndex;
              }
              if (lastIndex < val.length) {
                newChildren.push({ type: "text", value: val.slice(lastIndex) });
              }
            } else {
              newChildren.push(child);
            }
          } else {
            walk(child);
            newChildren.push(child);
          }
        }
        node.children = newChildren;
      }
    }
    walk(tree);
  };
}

export async function compileMarkdown(markdown: string) {
  const toc: TocItem[] = [];
  const highlighter = await createBlogHighlighter();
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeNormalizeImagePaths)
    .use(rehypeMermaid)
    .use(rehypeKatexNative)
    .use(rehypeSlug)
    .use(collectHtmlHeadings(toc))
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      test: (node) => !isFootnoteLabel(node as MarkdownNode),
      properties: {
        className: ["heading-anchor"],
        ariaLabel: "复制此章节链接",
      },
      content: {
        type: "text",
        value: "#",
      },
    })
    .use(rehypeShikiFromHighlighter, highlighter, {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      defaultColor: false,
      fallbackLanguage: "text",
    })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);

  return {
    html: String(file),
    toc,
    readingTimeMinutes: Math.max(1, Math.ceil(readingTime(markdown).minutes)),
    plainText: markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*_`[\]()!-]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}
