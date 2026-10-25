"use client";

import { useEffect, useState } from "react";
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (pathname ?? "").startsWith(href + "/");

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="site-header-inner">
        <SiteLogo />
        <nav className="primary-nav" aria-label="主导航">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive(item.href) ? "active" : ""}`}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              <span className="nav-link-text">{item.label}</span>
              {isActive(item.href) && <span className="nav-link-dot" aria-hidden="true" />}
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

