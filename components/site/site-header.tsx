"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { CommandTrigger } from "@/components/ui/command-trigger";
import { SiteLogo } from "./site-logo";

const navigation = [
  { href: "/writing", label: "文章" },
  { href: "/series", label: "系列" },
  { href: "/tags", label: "标签" },
  { href: "/playground", label: "实验室" },
  { href: "/about", label: "关于" },
];

export function SiteHeader() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (pathname ?? "").startsWith(href + "/");

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <SiteLogo />
        <nav className="primary-nav" aria-label="主导航">
          {navigation.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              <span className="nav-num" aria-hidden="true">
                {"0" + (index + 1)}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="site-tools">
          <CommandTrigger />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}

