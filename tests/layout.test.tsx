import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { ThemeProvider } from "@/components/theme/theme-provider";

describe("site shell", () => {
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
