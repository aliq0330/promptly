"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand-mark";
import { buttonClassName } from "@/components/ui/button";
import { filterNavItems, guestLoginNavItem, isNavItemActive, navGroups, PROFILE_NAV_PLACEHOLDER, settingsNavItem, type NavItem } from "@/components/layout/nav-items";
import { useProfileNavHref } from "@/features/auth/use-profile-nav-href";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
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
  const isModerator = useIsModerator();
  const status = useAuthStatus();
  const { requireAuth } = useAuthPrompt();
  const isAuthenticated = status === "authenticated";
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: filterNavItems(group.items, isAuthenticated) }))
    .filter((group) => group.items.length > 0);
  const bottomItems: NavItem[] = isAuthenticated
    ? [...(isModerator ? [{ href: "/moderation", labelKey: "nav.moderation" as const, icon: ShieldCheck }] : []), settingsNavItem]
    : status === "unauthenticated"
      ? [guestLoginNavItem]
      : [];

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
            "group relative flex h-10 items-center gap-3 rounded-md text-label font-medium transition-colors duration-200",
            "justify-center lg:justify-start lg:px-3",
            active ? "bg-surface-soft text-text" : "text-text-muted hover:bg-surface-soft/70 hover:text-text",
          )}
        >
          {/* Active indicator: a short accent bar on the rail's inner edge. */}
          {active && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-primary lg:-left-4" />}
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
            <span className="block font-serif text-[1.3rem] font-semibold tracking-[-0.02em] text-text">Promptly</span>
            <span className="mt-0.5 block text-caption text-text-muted">{t("nav.tagline")}</span>
          </span>
        </Link>
      </div>

      <div className="px-3 pb-2 lg:px-4">
        {status === "unauthenticated" ? (
          <button
            type="button"
            onClick={() => requireAuth("create")}
            aria-haspopup="dialog"
            title={t("nav.createShort")}
            className={buttonClassName({ className: "w-full font-semibold" })}
          >
            <Plus size={18} strokeWidth={2.4} />
            <span className="sr-only lg:not-sr-only">{t("nav.createShort")}</span>
          </button>
        ) : (
          <Link
            href="/create"
            title={t("nav.createShort")}
            className={buttonClassName({ className: "w-full font-semibold" })}
          >
            <Plus size={18} strokeWidth={2.4} />
            <span className="sr-only lg:not-sr-only">{t("nav.createShort")}</span>
          </Link>
        )}
      </div>

      <nav aria-label={t("nav.primaryLabel")} className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 lg:px-4">
        {visibleGroups.map((group) => (
          <div key={group.labelKey}>
            <p className="mb-1.5 hidden px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted lg:block">
              {t(group.labelKey)}
            </p>
            <div aria-hidden className="mx-auto mb-2 h-px w-8 bg-border-soft lg:hidden" />
            <ul className="space-y-0.5">{group.items.map(renderItem)}</ul>
          </div>
        ))}
      </nav>

      {bottomItems.length > 0 && (
        <div className="border-t border-border-soft px-3 py-3 lg:px-4">
          <ul className="space-y-0.5">{bottomItems.map(renderItem)}</ul>
        </div>
      )}
    </aside>
  );
}
