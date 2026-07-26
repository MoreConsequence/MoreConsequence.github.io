import { CodeCopy } from "./code-copy";
import { MermaidRenderer } from "./mermaid-renderer";

export function ArticleBody({ html }: { html: string }) {
  return (
    <div className="article-body">
      <div
        className="article-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CodeCopy />
      <MermaidRenderer />
    </div>
  );
}
