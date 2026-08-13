import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <p className="eyebrow">保持联系 / 订阅更新</p>
          <p className="footer-statement">
            写关于软件、系统，以及长期有效的工程判断。
          </p>
        </div>
        <div className="footer-links">
          <Link href="/rss.xml">RSS 订阅</Link>
          <Link href="/about">关于作者</Link>
          <a href="#top">回到顶部 ↑</a>
        </div>
        <div className="footer-meta">
          <span>© {new Date().getFullYear()} HaoYu · 技术札记</span>
          <span>内容由 Markdown 驱动 · 静态导出</span>
        </div>
      </div>
    </footer>
  );
}

