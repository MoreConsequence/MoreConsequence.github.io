import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { ThemeProvider } from "@/components/theme/theme-provider";
import Home from "@/app/page";

describe("site shell", () => {
  it("renders the home hero as two explicit horizontal title lines", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain(
      '<span class="hero-line">在复杂系统里，</span>',
    );
    expect(html).toContain(
      '<span class="hero-line hero-line-accent">寻找清晰的边界。</span>',
    );
  }, 15_000);

  it("renders primary navigation, search and theme controls", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <SiteHeader />
      </ThemeProvider>,
    );

    expect(html).toContain("HaoYu");
    expect(html).toContain('href="/writing"');
    expect(html).toContain('href="/tags"');
    expect(html).toContain('href="/about"');
    expect(html).toContain("搜索");
    expect(html).toContain("外观主题");
  });

  it("renders publishing and subscription links in the footer", () => {
    const html = renderToStaticMarkup(<SiteFooter />);

    expect(html).toContain('href="/rss.xml"');
    expect(html).toContain("Markdown");
  });
});
