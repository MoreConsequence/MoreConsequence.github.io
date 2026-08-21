import Link from "next/link";

export function SiteLogo() {
  return (
    <Link className="site-logo" href="/" aria-label="边界笔记首页">
      <span className="site-logo-mark" aria-hidden="true">
        界
      </span>
      <span className="site-logo-type">
        <strong>边界笔记</strong>
        <small>BOUNDARY NOTES</small>
      </span>
    </Link>
  );
}
