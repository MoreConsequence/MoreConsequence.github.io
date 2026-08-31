import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SearchDialog } from "@/components/search/search-dialog";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { siteConfig } from "@/lib/site";
import "./globals.css";
import "./kami-global-layer.css";
import "./editorial-ui.css";
import "./sandboxes.css";
import "katex/dist/katex.min.css";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: siteConfig.name,
      template: `%s — ${siteConfig.name}`,
    },
    description: siteConfig.description,
    alternates: {
      types: {
        "application/rss+xml": "/rss.xml",
      },
    },
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      url: siteConfig.url,
      siteName: siteConfig.name,
      title: siteConfig.name,
      description: siteConfig.description,
      images: [
        {
          url: `${siteConfig.url}/og.png`,
          width: 1200,
          height: 630,
          alt: "边界笔记：在复杂系统里，寻找清晰的边界。",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: siteConfig.name,
      description: siteConfig.description,
      images: [`${siteConfig.url}/og.png`],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning id="top">
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <a className="skip-link" href="#content">
            跳到正文
          </a>
          <SiteHeader />
          <SearchDialog />
          <main id="content">{children}</main>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
