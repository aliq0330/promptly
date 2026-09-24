"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavItemActive, mobileNavItems, PROFILE_NAV_PLACEHOLDER } from "@/components/layout/nav-items";
import { useProfileNavHref } from "@/features/auth/use-profile-nav-href";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Mobile-only bottom navigation; the middle "Oluştur" action is visually emphasized. */
export function MobileNav() {
  const pathname = usePathname();
  const profileNavHref = useProfileNavHref();
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("nav.primaryLabel")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="flex h-16 items-stretch">
        {mobileNavItems.map((item) => {
          const href = item.href === PROFILE_NAV_PLACEHOLDER ? profileNavHref : item.href;
          const active = isNavItemActive(pathname, item);
          const Icon = item.icon;
          const label = t(item.labelKey);
          const isCreate = item.href === "/create";
          return (
            <li key={item.labelKey} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-text" : "text-text-muted",
                )}
              >
                {isCreate ? (
                  <span
                    className={cn(
                      "flex h-9 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95",
                      active && "ring-2 ring-primary/30 ring-offset-2 ring-offset-surface",
                    )}
                  >
                    <Icon size={20} strokeWidth={2.4} />
                  </span>
                ) : (
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-primary" : undefined} />
                )}
                <span className={isCreate ? "sr-only" : undefined}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
