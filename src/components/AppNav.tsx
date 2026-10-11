"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/market", label: "Market" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/40 bg-ink/95 backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:backdrop-blur-none"
    >
      <ul className="mx-auto flex max-w-6xl justify-around md:justify-start md:gap-8">
        {LINKS.map((l) => {
          const current = path === l.href || path.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={`relative flex min-h-14 items-center px-3 text-[.95rem] transition-colors md:min-h-12 md:px-0 ${
                  current ? "text-gold" : "text-mute hover:text-ivory"
                } after:absolute after:inset-x-3 after:top-0 after:h-0.5 after:bg-gold after:opacity-0 aria-[current=page]:after:opacity-100 md:after:inset-x-0 md:after:bottom-0 md:after:top-auto md:after:h-px`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
