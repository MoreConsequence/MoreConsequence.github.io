import Link from "next/link";

export function SiteLogo() {
  return (
    <Link className="site-logo" href="/" aria-label="HaoYu 技术札记首页">
      <span className="site-logo-mark" aria-hidden="true">
        H/Y
      </span>
      <span className="site-logo-type">
        <strong>HaoYu</strong>
        <small>技术札记</small>
      </span>
    </Link>
  );
}
