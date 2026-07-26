import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
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

export async function compileMarkdown(markdown: string) {
  const toc: TocItem[] = [];
  const highlighter = await createBlogHighlighter();
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
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
    })
    .use(rehypeStringify)
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
