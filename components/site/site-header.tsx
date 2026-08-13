import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { CommandTrigger } from "@/components/ui/command-trigger";
import { SiteLogo } from "./site-logo";

const navigation = [
  { href: "/writing", label: "文章" },
  { href: "/tags", label: "标签" },
  { href: "/about", label: "关于" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <SiteLogo />
        <nav className="primary-nav" aria-label="主导航">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
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
