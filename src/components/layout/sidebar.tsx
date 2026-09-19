"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { primaryNavItems } from "@/components/layout/nav-items";
import { useProfileNavHref } from "@/features/auth/use-profile-nav-href";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const profileNavHref = useProfileNavHref();

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border lg:bg-surface">
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="text-lg font-semibold text-primary">
          Promptly
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {primaryNavItems.map((item) => {
          const href = item.href === "/profile/me" ? profileNavHref : item.href;
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent-surface text-primary"
                  : "text-text-muted hover:bg-accent-surface hover:text-text",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.25 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
