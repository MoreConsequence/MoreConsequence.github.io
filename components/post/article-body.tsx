import { CodeCopy } from "./code-copy";

export function ArticleBody({ html }: { html: string }) {
  return (
    <div className="article-body">
      <div
        className="article-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CodeCopy />
    </div>
  );
}
