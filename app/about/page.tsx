import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "关于",
  description: "关于 HaoYu、这个博客和持续写作。",
};

export default function AboutPage() {
  return (
    <div className="about-page">
      <header className="about-hero">
        <p className="eyebrow">About / A working note</p>
        <h1>
          你好，
          <br />
          我是 <span>HaoYu。</span>
        </h1>
        <p>
          一名喜欢把复杂问题拆回清晰边界的软件开发者。这里不是知识库，也不是更新日志，而是一份持续生长的工程手记。
        </p>
      </header>

      <div className="about-grid">
        <aside>
          <p className="eyebrow">Principles</p>
          <ol>
            <li>先理解问题，再选择工具</li>
            <li>让边界比聪明更可靠</li>
            <li>写下能够经受时间的判断</li>
          </ol>
        </aside>
        <div className="about-copy">
          <section>
            <span>01</span>
            <div>
              <h2>为什么写</h2>
              <p>
                写作迫使模糊的直觉变成可以检验的语言。文章发布以后，也为未来的自己保留了一条重新进入问题的路径。
              </p>
            </div>
          </section>
          <section>
            <span>02</span>
            <div>
              <h2>这里会出现什么</h2>
              <p>
                Go、JavaScript、系统设计、Agent
                工程和开发工具。主题会变化，但始终关心软件如何被更清楚地理解、构建与维护。
              </p>
            </div>
          </section>
          <section>
            <span>03</span>
            <div>
              <h2>保持联系</h2>
              <p>
                最简单的方式是订阅 RSS。没有推荐算法，也没有额外通知，只有新文章发布时的一次安静更新。
              </p>
              <Link className="button-primary" href="/rss.xml">
                订阅 RSS <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
