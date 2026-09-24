"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand-mark";
import { isNavItemActive, navGroups, PROFILE_NAV_PLACEHOLDER, settingsNavItem, type NavItem } from "@/components/layout/nav-items";
import { useProfileNavHref } from "@/features/auth/use-profile-nav-href";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Desktop: full 256px sidebar with grouped navigation.
 * Tablet (md–lg): the same component collapses to a 72px icon rail —
 * labels become accessible names/tooltips, group titles become dividers.
 * Mobile: hidden (MobileNav takes over).
 */
export function Sidebar() {
  const pathname = usePathname();
  const profileNavHref = useProfileNavHref();
  const { t } = useTranslation();

  function renderItem(item: NavItem) {
    const href = item.href === PROFILE_NAV_PLACEHOLDER ? profileNavHref : item.href;
    const active = isNavItemActive(pathname, item);
    const Icon = item.icon;
    const label = t(item.labelKey);
    return (
      <li key={item.labelKey}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          title={label}
          className={cn(
            "group flex h-10 items-center gap-3 rounded-md text-label font-medium transition-colors duration-200",
            "justify-center lg:justify-start lg:px-3",
            active ? "bg-surface-soft text-text" : "text-text-muted hover:bg-surface-soft/70 hover:text-text",
          )}
        >
          <Icon size={19} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-primary" : undefined} />
          <span className="sr-only lg:not-sr-only">{label}</span>
        </Link>
      </li>
    );
  }

  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border-soft bg-surface md:flex md:w-[72px] lg:w-64">
      <div className="flex h-16 items-center justify-center px-3 lg:justify-start lg:px-5">
        <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label="Promptly">
          <BrandMark size={30} />
          <span className="hidden leading-none lg:block">
            <span className="block font-display text-[1.15rem] font-semibold tracking-tight text-text">Promptly</span>
            <span className="mt-0.5 block text-caption text-text-muted">{t("nav.tagline")}</span>
          </span>
        </Link>
      </div>

      <div className="px-3 pb-2 lg:px-4">
        <Link
          href="/create"
          title={t("nav.createShort")}
          className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-label font-semibold text-primary-foreground shadow-xs transition-colors duration-200 hover:bg-primary-hover"
        >
          <Plus size={18} strokeWidth={2.4} />
          <span className="sr-only lg:not-sr-only">{t("nav.createShort")}</span>
        </Link>
      </div>

      <nav aria-label={t("nav.primaryLabel")} className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 lg:px-4">
        {navGroups.map((group) => (
          <div key={group.labelKey}>
            <p className="mb-1 hidden px-3 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted lg:block">
              {t(group.labelKey)}
            </p>
            <div aria-hidden className="mx-auto mb-2 h-px w-8 bg-border-soft lg:hidden" />
            <ul className="space-y-0.5">{group.items.map(renderItem)}</ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border-soft px-3 py-3 lg:px-4">
        <ul>{renderItem(settingsNavItem)}</ul>
      </div>
    </aside>
  );
}
