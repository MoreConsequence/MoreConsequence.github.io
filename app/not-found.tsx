import Link from "next/link";

export default function NotFound() {
  return (
    <div className="not-found">
      <div className="not-found-code" aria-hidden="true">
        404
      </div>
      <div>
        <p className="eyebrow">Lost in the archive</p>
        <h1>这一页没有留下记录。</h1>
        <p>链接可能已经移动，或者这篇文章还在草稿里。</p>
        <Link className="button-primary" href="/">
          返回首页 <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </div>
  );
}
